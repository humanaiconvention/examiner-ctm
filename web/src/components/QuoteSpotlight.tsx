import { useEffect, useMemo, useState } from 'react'
import { consciousnessQuotes } from '../config/quotes'
import './QuoteSpotlight.css'

const MAX_AUTOPLAY_QUOTES = 30
const AUTOPLAY_PRESETS = [
  { label: 'Relaxed', value: 10000 },
  { label: 'Standard', value: 6000 },
  { label: 'Energetic', value: 4000 },
]

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export default function QuoteSpotlight() {
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [autoAdvanceMs] = useState(AUTOPLAY_PRESETS[1]?.value ?? 6000)
  const [shuffledQuotes, setShuffledQuotes] = useState<typeof consciousnessQuotes>([])
  const [animationKey, setAnimationKey] = useState(0) // Used to trigger CSS reflows

  useEffect(() => {
    const initialPool = consciousnessQuotes.slice(0, MAX_AUTOPLAY_QUOTES)
    setShuffledQuotes(shuffleArray(initialPool))
  }, [])

  const quoteCount = shuffledQuotes.length
  const activeQuote = useMemo(() => (quoteCount === 0 ? null : shuffledQuotes[quoteIndex]), [quoteIndex, quoteCount, shuffledQuotes])

  // Autoplay Logic
  useEffect(() => {
    if (!autoPlayEnabled || quoteCount === 0) return
    
    // Reset animation key to restart progress bar
    setAnimationKey(k => k + 1)
    
    const timer = setTimeout(() => {
      setQuoteIndex(prev => (prev + 1) % quoteCount)
    }, autoAdvanceMs)

    return () => clearTimeout(timer)
  }, [quoteIndex, autoPlayEnabled, autoAdvanceMs, quoteCount])

  const handleNext = () => {
    setAutoPlayEnabled(false) // Pause on interaction
    setQuoteIndex(prev => (prev + 1) % quoteCount)
  }

  const handlePrev = () => {
    setAutoPlayEnabled(false)
    setQuoteIndex(prev => (prev - 1 + quoteCount) % quoteCount)
  }

  if (!activeQuote) return null

  return (
    <section className="quote-spotlight-container" id="voices" aria-label="Perspectives on consciousness">
      <div className="quote-spotlight-card">
        {/* Quote Text */}
        <h2 key={`q-${quoteIndex}`} className="quote-spotlight-text active">
          “{activeQuote.text}”
        </h2>

        {/* Metadata */}
        <div key={`m-${quoteIndex}`} className="quote-spotlight-meta animate-in">
          <div className="quote-author">{activeQuote.author}</div>
          
          {(activeQuote.year) && (
             <>
               <span className="quote-separator hidden sm:block"></span>
               <div className="quote-year">{activeQuote.year}</div>
             </>
          )}

          {(activeQuote.source) && (
              <>
                <span className="quote-separator hidden sm:block"></span>
                <div className="quote-source">{activeQuote.source}</div>
              </>
          )}
        </div>

        {/* Progress Bar */}
        <div className="quote-progress-track">
           <div 
             className="quote-progress-fill" 
             key={animationKey}
             style={{ 
               width: autoPlayEnabled ? '100%' : '0%', 
               transition: autoPlayEnabled ? `width ${autoAdvanceMs}ms linear` : 'none' 
             }}
           />
        </div>

        {/* Minimal Controls */}
        <div className="quote-controls">
           <button onClick={handlePrev} className="quote-control-btn" title="Previous">←</button>
           <button onClick={() => setAutoPlayEnabled(!autoPlayEnabled)} className="quote-control-btn" title={autoPlayEnabled ? "Pause" : "Play"}>
             {autoPlayEnabled ? '❚❚' : '▶'}
           </button>
           <button onClick={handleNext} className="quote-control-btn" title="Next">→</button>
        </div>
      </div>
    </section>
  )
}
