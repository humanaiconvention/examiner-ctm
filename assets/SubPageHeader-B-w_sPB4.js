import{j as r}from"./index-ConUIkTD.js";function i({activePage:n}){const o=(e,a)=>{e.preventDefault(),window.history.pushState({},"",a),window.dispatchEvent(new PopStateEvent("popstate"))},t=e=>({color:e?"#22d3ee":"#9ca3af",textDecoration:"none",transition:"color 0.2s ease",cursor:"pointer",fontSize:"0.875rem"});return r.jsxs(r.Fragment,{children:[r.jsx("header",{className:"subpage-header",children:r.jsxs("div",{className:"subpage-header__inner",children:[r.jsxs("a",{href:"/",onClick:e=>o(e,"/"),className:"subpage-header__logo",children:[r.jsx("img",{src:"/logo.svg",alt:"Logo"}),r.jsx("span",{children:"HumanAI Convention"})]}),r.jsxs("nav",{className:"subpage-header__nav",children:[r.jsx("a",{href:"/learn-more",onClick:e=>o(e,"/learn-more"),style:t(n==="learn-more"),onMouseOver:e=>{n!=="learn-more"&&(e.currentTarget.style.color="#fff")},onMouseOut:e=>{n!=="learn-more"&&(e.currentTarget.style.color="#9ca3af")},children:"Learn More"}),r.jsx("a",{href:"/convention",onClick:e=>o(e,"/convention"),style:t(n==="convention"),onMouseOver:e=>{n!=="convention"&&(e.currentTarget.style.color="#fff")},onMouseOut:e=>{n!=="convention"&&(e.currentTarget.style.color="#9ca3af")},children:"The Convention"}),r.jsx("a",{href:"/preview",onClick:e=>o(e,"/preview"),style:t(n==="preview"),onMouseOver:e=>{n!=="preview"&&(e.currentTarget.style.color="#fff")},onMouseOut:e=>{n!=="preview"&&(e.currentTarget.style.color="#9ca3af")},children:"Preview"})]})]})}),r.jsx("style",{children:`
        .subpage-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background-color: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .subpage-header__inner {
          max-width: 72rem; /* max-w-6xl */
          margin: 0 auto;
          padding: 1rem 1.5rem; /* py-4 px-6 */
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .subpage-header__logo {
          display: flex;
          align-items: center;
          gap: 0.75rem; /* gap-3 */
          text-decoration: none;
          color: #e5e7eb; /* text-gray-200 */
        }
        .subpage-header__logo img {
          height: 2rem; /* h-8 */
          width: 2rem; /* w-8 */
        }
        .subpage-header__logo span {
          font-weight: 600;
          font-size: 1.125rem; /* text-lg */
        }
        .subpage-header__nav {
          display: flex;
          align-items: center;
          gap: 1.5rem; /* gap-6 */
        }
      `})]})}export{i as S};
