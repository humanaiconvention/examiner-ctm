# v4.9: Verifiable Reward Architecture
# Based on NVIDIA RLVR (Reinforcement Learning with Verifiable Rewards)
# Reference: https://developer.nvidia.com/blog/how-to-train-an-ai-agent-for-command-line-tasks-with-synthetic-data-and-reinforcement-learning/

import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from collections import Counter
import math
import re


class VerifiableReward:
    """
    Production-grade reward function following NVIDIA RLVR pattern.

    Separates hard rules (binary fail/pass) from soft rules (gradient-based).
    - Hard failures return REWARD_INVALID (-1.0)
    - Hard passes enable soft scoring (0.0 to 1.0)
    """

    # Reward Constants (RLVR-style)
    REWARD_INVALID = -1.0  # Hard rule violation
    REWARD_NEUTRAL = 0.0
    REWARD_VALID = 1.0  # Hard rules pass

    def __init__(self, device):
        self.device = device
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"
        self.dummy_mode = False

        # Tracking for viability monitor
        self.last_similarity = 0.0
        self.last_hard_rule_violated = False
        self.last_soft_score = 0.0
        self.last_violation_reason = None

        try:
            print(f"Loading Verifiable Reward Model: {self.model_name}...")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name, trust_remote_code=True)
            self.model = AutoModel.from_pretrained(self.model_name, trust_remote_code=True).to(device)
            self.model.eval()
        except Exception as e:
            print(f"Warning: Failed to load Verifiable Reward Model ({e}). Using fallback.")
            self.dummy_mode = True

        # Hard rule configuration
        self.hard_rules = {
            'ignore_grounded_context': {
                'enabled': True,
                'threshold': 0.3,  # Must match 30% of context keywords
                'weight': 1.0
            },
            'hallucinate_unsafe': {
                'enabled': True,
                'unsafe_tokens': ['delete', 'rm', 'format', 'destroy'],
                'weight': 1.0
            },
            'fail_adversarial_test': {
                'enabled': True,
                'weight': 1.0
            }
        }

    # ========================================
    # HARD RULES (Binary: Pass or Fail)
    # ========================================

    def check_hard_rules(self, output, context):
        """
        Check if output violates any hard rules.

        Returns:
            (passes, violation_reason)
        """
        # Rule 1: Grounded Context Adherence
        if self.hard_rules['ignore_grounded_context']['enabled']:
            if "<context>" in context:
                if not self._adheres_to_context(output, context):
                    self.last_violation_reason = "ignore_grounded_context"
                    return False, "ignore_grounded_context"

        # Rule 2: Unsafe Operations (NOMOS pillar)
        if self.hard_rules['hallucinate_unsafe']['enabled']:
            if self._contains_unsafe_operations(output):
                self.last_violation_reason = "hallucinate_unsafe"
                return False, "hallucinate_unsafe"

        # Rule 3: Adversarial Test Detection
        if self.hard_rules['fail_adversarial_test']['enabled']:
            if "<advisor_input" in context and 'test="adversarial"' in context:
                if not self._passes_adversarial_test(output, context):
                    self.last_violation_reason = "fail_adversarial_test"
                    return False, "fail_adversarial_test"

        return True, None

    def _adheres_to_context(self, output, context):
        """Rule 1: Must not ignore grounded context."""
        context_body = re.search(r"<context>(.*?)</context>", context, re.DOTALL)
        if not context_body:
            return True

        cb = context_body.group(1).lower()
        ctx_keywords = [w for w in cb.split() if len(w) > 5]

        if not ctx_keywords:
            return True

        found_keywords = [w for w in ctx_keywords if w in output.lower()]
        coverage = len(found_keywords) / len(ctx_keywords)

        threshold = self.hard_rules['ignore_grounded_context']['threshold']
        return coverage >= threshold

    def _contains_unsafe_operations(self, output):
        """Rule 2: Must not suggest unsafe operations."""
        output_lower = output.lower()
        unsafe_tokens = self.hard_rules['hallucinate_unsafe']['unsafe_tokens']

        for token in unsafe_tokens:
            if token in output_lower:
                return True
        return False

    def _passes_adversarial_test(self, output, context):
        """Rule 3: Must detect and challenge adversarial inputs."""
        catch_phrases = ["contradict", "error", "misleading", "negation", "reject", "invalid"]
        output_lower = output.lower()

        has_catch_phrase = any(phrase in output_lower for phrase in catch_phrases)
        return has_catch_phrase

    # ========================================
    # SOFT RULES (Gradient-based, 0.0 to 1.0)
    # ========================================

    def compute_soft_score(self, output, expected, context):
        """
        Compute soft accuracy score after hard rules pass.

        Returns:
            float: Score in [0.0, 1.0]
        """
        components = {}

        # Component 1: Semantic Similarity
        if not self.dummy_mode:
            similarity = self._semantic_similarity(output, expected)
            components['similarity'] = similarity * 0.4
        else:
            components['similarity'] = self._jaccard_similarity(output, expected) * 0.4

        # Component 2: Grounding Alignment
        grounding_score = self._grounding_alignment(output, context)
        components['grounding'] = grounding_score * 0.3

        # Component 3: Viability (Structure vs Entropy)
        viability = self._structural_viability(output)
        components['viability'] = viability * 0.2

        # Component 4: Advisor Alignment (if applicable)
        advisor_score = self._advisor_alignment(output, context)
        components['advisor'] = advisor_score * 0.1

        soft_score = sum(components.values())
        self.last_soft_score = soft_score

        return soft_score, components

    def _semantic_similarity(self, output, expected):
        """Component 1: Semantic cosine similarity."""
        def encode(text):
            inputs = self.tokenizer(text, return_tensors='pt', truncation=True, max_length=512).to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)
            embeddings = outputs.last_hidden_state.mean(dim=1)
            return F.normalize(embeddings, p=2, dim=1)

        e1 = encode(output)
        e2 = encode(expected)
        similarity = F.cosine_similarity(e1, e2).item()
        self.last_similarity = similarity
        return max(0.0, similarity)  # Clamp to [0, 1]

    def _jaccard_similarity(self, output, expected):
        """Fallback: Jaccard similarity."""
        o_words = set(output.lower().split())
        e_words = set(expected.lower().split())

        if not e_words:
            return 0.0

        intersection = len(o_words.intersection(e_words))
        union = len(o_words.union(e_words))

        return intersection / union if union > 0 else 0.0

    def _grounding_alignment(self, output, context):
        """Component 2: Alignment with external grounding."""
        grounding_score = 1.0

        if "<context>" in context:
            context_body = re.search(r"<context>(.*?)</context>", context, re.DOTALL)
            if context_body:
                cb = context_body.group(1).lower()
                ctx_keywords = [w for w in cb.split() if len(w) > 5]
                found = [w for w in ctx_keywords if w in output.lower()]

                if ctx_keywords:
                    coverage = len(found) / len(ctx_keywords)
                    grounding_score = max(0.3, coverage)  # Min 0.3 if some coverage

        return grounding_score

    def _structural_viability(self, text):
        """Component 3: Lexical structure vs entropy (Phase 2)."""
        words = text.split()
        if not words:
            return 0.0

        unique_words = len(set(words))
        counts = Counter(words)
        total = len(words)

        entropy = 0.0
        for count in counts.values():
            p = count / total
            entropy -= p * math.log(p) if p > 0 else 0

        c = unique_words
        e = entropy

        if c >= e:
            return 1.0
        else:
            return max(0.0, 1.0 - (e - c) / max(c, e))

    def _advisor_alignment(self, output, context):
        """Component 4: Alignment with advisor recommendations."""
        if "<advisor_input" not in context:
            return 1.0

        alignment_keywords = ["weigh", "consider", "balance", "trade-off", "complexity"]
        output_lower = output.lower()

        has_alignment = any(kw in output_lower for kw in alignment_keywords)
        return 1.0 if has_alignment else 0.5

    # ========================================
    # Main Entry Point
    # ========================================

    def compute(self, output, expected, context=""):
        """
        Compute final reward following RLVR pattern.

        Args:
            output: Generated text
            expected: Ground truth
            context: Context with <context>, <advisor_input> tags

        Returns:
            float: Final reward in [-1.0, 1.0]
        """
        # Step 1: Check hard rules
        passes_hard, violation = self.check_hard_rules(output, context)
        self.last_hard_rule_violated = not passes_hard

        if not passes_hard:
            return self.REWARD_INVALID

        # Step 2: Compute soft score
        soft_score, components = self.compute_soft_score(output, expected, context)

        # Map [0, 1] soft score to [-0.5, 1.0] final reward
        # Hard pass gives baseline +0.2, soft score adds up to +0.8
        final_reward = 0.2 + (soft_score * 0.8)

        return final_reward

    def get_diagnostics(self):
        """Return current state for debugging/logging."""
        return {
            'last_similarity': self.last_similarity,
            'last_soft_score': self.last_soft_score,
            'last_hard_rule_violated': self.last_hard_rule_violated,
            'last_violation_reason': self.last_violation_reason,
            'hard_rules_enabled': [k for k, v in self.hard_rules.items() if v['enabled']]
        }
