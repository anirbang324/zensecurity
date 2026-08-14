// Load content from data/content.json and render cards
const state = {
  items: [],
  filter: 'all',
  q: '',
  sort: 'newest',
};

// Map types to short labels
const TYPE_LABEL = {
  blog: 'Blog',
  podcast: 'Podcast',
  talk: 'Talk',
  video: 'Video',
  profile: 'Profile'
};

function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'});
}

function render(){
  const cards = document.getElementById('cards');
  const q = state.q.trim().toLowerCase();
  let items = state.items.filter(it => (state.filter==='all' || it.type===state.filter));
  if (q){
    items = items.filter(it =>
      (it.title||'').toLowerCase().includes(q) ||
      (it.description||'').toLowerCase().includes(q) ||
      (it.source||'').toLowerCase().includes(q) ||
      (it.tags||[]).join(' ').toLowerCase().includes(q)
    );
  }
  if (state.sort==='newest'){
    items.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  } else if (state.sort==='oldest'){
    items.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  } else if (state.sort==='title'){
    items.sort((a,b)=> (a.title||'').localeCompare(b.title||''));
  }

  if (items.length === 0) {
    cards.innerHTML = '<div class="empty-state">No results found. Try a different search or filter.</div>';
    return;
  }

  cards.innerHTML = items.map(it => {
    // Use specific thumbnail if provided; otherwise fall back to type-specific asset
    const ext = it.type === 'profile' ? 'png' : 'jpg';
    const img = it.thumbnail || `assets/${it.type || 'default'}.${ext}`;
    const typeBadge = TYPE_LABEL[it.type] || it.type || '';
    return `
      <article class="card">
        <div class="kicker">${typeBadge}${it.source ? ' • ' + it.source : ''}</div>
        <div class="thumb"><img src="${img}" alt="${it.title}" onerror="this.onerror=null;this.src='assets/default.png'"></div>
        <h3>${it.title}</h3>
        <div class="meta">
          ${it.date ? `<span>${fmtDate(it.date)}</span><span class="dot"></span>` : ''}
          ${it.duration ? `<span>${it.duration}</span><span class="dot"></span>` : ''}
          ${it.author ? `<span>${it.author}</span>` : ''}
        </div>
        ${it.description ? `<p class="desc">${it.description}</p>` : ''}
        <div class="actions">
          <a class="btn primary" href="${it.url}" target="_blank" rel="noopener">Open</a>
          ${it.secondary ? `<a class="btn ghost" href="${it.secondary}" target="_blank" rel="noopener">Alt Link</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

async function init(){
  document.getElementById('year').textContent = new Date().getFullYear();

  // Mobile nav toggle
  const toggle = document.getElementById('nav-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      mobileMenu.classList.toggle('hidden');
      mobileMenu.setAttribute('aria-hidden', String(expanded));
    });
    // Close menu when a link inside it is clicked
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
      });
    });
  }

  // Filter chips
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      render();
    });
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', (e)=>{
    state.sort = e.target.value;
    render();
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e)=>{
    state.q = e.target.value;
    render();
  });
  document.getElementById('clearSearch').addEventListener('click', ()=>{
    state.q=''; searchInput.value=''; render();
  });

  // Load content
  try{
    const res = await fetch('data/content.json', {cache:'no-store'});
    const json = await res.json();
    state.items = json.items || [];
  }catch(e){
    console.error('Failed to load content.json', e);
    document.getElementById('cards').innerHTML = '<div class="empty-state">Failed to load content. Please try refreshing the page.</div>';
    return;
  }
  render();
}
init();