import './style.css';
import { createIcons, Heart, Search, SlidersHorizontal, Sparkles, ArrowUpRight, ChevronRight, Bookmark, Shirt, Sun, CloudSun, CalendarDays, X, Check, Menu, UserRound, Mail, LockKeyhole, LogOut, Save } from 'lucide';

let products = [];
let wardrobe = [];
let profile = { name: 'Alex Morgan', initials: 'AM', dateLabel: 'Thursday, September 18', styleSignal: 'You\'re reaching for softer textures lately.', discoverCount: 12, wardrobeCount: 38, savedCount: 8 };
let saved = new Set();
let loading = true;
let apiError = '';
const categories = ['All pieces', 'Shirts', 'Trousers', 'Knitwear', 'Accessories', 'Denim', 'Shoes'];
const apiBaseUrl = import.meta.env.VITE_API_URL || '';
let activeCategory = 'All pieces';
let query = '';
let drawerOpen = false;
let savedOnly = false;
let sessionToken = localStorage.getItem('closetiq_token') || '';
let accountEmail = '';
let authMode = 'login';
let authBusy = false;
let authError = '';

function renderAuth() {
  document.querySelector('#app').innerHTML = `<main class="auth-shell"><section class="auth-art"><div class="brand auth-brand"><span class="brand-mark">C</span><span>closet<span class="brand-iq">iq</span></span></div><div class="auth-art-copy"><p class="eyebrow">YOUR PERSONAL EDIT</p><h1>Get dressed<br/><em>with intention.</em></h1><p>Save your wardrobe, discover pieces that fit your point of view, and make every morning a little easier.</p></div><span class="auth-art-note">A considered wardrobe is a quiet kind of confidence.</span></section><section class="auth-panel"><div class="auth-panel-inner"><p class="eyebrow">${authMode === 'login' ? 'WELCOME BACK' : 'START YOUR EDIT'}</p><h2>${authMode === 'login' ? 'Sign in to ClosetIQ' : 'Create your account'}</h2><p class="auth-subtitle">${authMode === 'login' ? 'Your daily edit is waiting for you.' : 'Build a wardrobe that feels like you.'}</p><form id="auth-form" class="auth-form"><label class="form-field ${authMode === 'register' ? '' : 'is-hidden'}"><span>Full name</span><div><i data-lucide="user-round"></i><input name="name" type="text" autocomplete="name" placeholder="Alex Morgan" ${authMode === 'register' ? 'required' : ''}/></div></label><label class="form-field"><span>Email address</span><div><i data-lucide="mail"></i><input name="email" type="email" autocomplete="email" placeholder="you@example.com" required/></div></label><label class="form-field"><span>Password</span><div><i data-lucide="lock-keyhole"></i><input name="password" type="password" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" placeholder="At least 6 characters" minlength="6" required/></div></label>${authError ? `<p class="auth-error">${authError}</p>` : ''}<button class="auth-submit" type="submit" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Connecting...' : authMode === 'login' ? 'Sign in' : 'Create account'} <i data-lucide="arrow-up-right"></i></button></form><button class="auth-switch" id="auth-switch">${authMode === 'login' ? 'New to ClosetIQ? Create an account' : 'Already have an account? Sign in'}</button><p class="auth-demo">Demo account: <strong>alex@example.com</strong> / <strong>closetiq</strong></p></div></section></main>`;
  createIcons({ icons: { UserRound, Mail, LockKeyhole, ArrowUpRight } });
  document.querySelector('#auth-switch').addEventListener('click', () => { authMode = authMode === 'login' ? 'register' : 'login'; authError = ''; renderAuth(); });
  document.querySelector('#auth-form').addEventListener('submit', handleAuthSubmit);
}

function productCard(product, compact = false) {
  return `<article class="product-card ${compact ? 'product-card--compact' : ''}" data-product="${product.id}" tabindex="0">
    <div class="product-image-wrap">
      <img src="${product.image}" alt="${product.name}" class="product-image" />
      <button class="save-button ${saved.has(product.id) ? 'is-saved' : ''}" data-save="${product.id}" aria-label="${saved.has(product.id) ? 'Remove from saved' : 'Save item'}">
        <i data-lucide="bookmark"></i>
      </button>
      ${!compact ? `<span class="match-badge"><i data-lucide="sparkles"></i>${product.match}% match</span>` : ''}
    </div>
    <div class="product-info">
      <div class="product-heading"><h3>${product.name}</h3><span>$${product.price}</span></div>
      <p>${product.color} · ${product.style}</p>
      ${!compact ? `<div class="product-note"><span class="tiny-dot"></span><span>${product.note}</span><button class="feedback-button" data-feedback="${product.id}" aria-label="Dismiss ${product.name}"><i data-lucide="x"></i></button></div>` : ''}
    </div>
  </article>`;
}

function render() {
  const filtered = products.filter((product) => {
    const matchesCategory = activeCategory === 'All pieces' || product.category === activeCategory;
    const haystack = `${product.name} ${product.category} ${product.style} ${product.color}`.toLowerCase();
    return matchesCategory && (!savedOnly || saved.has(product.id)) && haystack.includes(query.toLowerCase());
  });
  const recommended = filtered.slice(0, 4);
  const wardrobeItems = wardrobe.length ? wardrobe : products.slice(0, 3);
  document.querySelector('#app').innerHTML = `
    <div class="app-shell ${drawerOpen ? 'drawer-is-open' : ''}">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">C</span><span>closet<span class="brand-iq">iq</span></span></div>
        <div class="sidebar-profile"><div class="avatar">${profile.initials}</div><div><strong>${profile.name}</strong><span>Personal edit</span></div><button class="more-button" data-nav="account menu" aria-label="Open account menu">•••</button></div>
        <nav class="main-nav" aria-label="Main navigation">
          <p class="nav-label">Your space</p>
          <button class="nav-item is-active" data-nav="discover"><i data-lucide="sparkles"></i>Discover <span class="nav-count">${profile.discoverCount}</span></button>
          <button class="nav-item" data-nav="wardrobe"><i data-lucide="shirt"></i>My wardrobe <span class="nav-count">${profile.wardrobeCount}</span></button>
          <button class="nav-item" data-nav="saved looks"><i data-lucide="bookmark"></i>Saved looks <span class="nav-count">${profile.savedCount}</span></button>
          <p class="nav-label nav-label--second">Plan ahead</p>
          <button class="nav-item" data-nav="calendar"><i data-lucide="calendar-days"></i>Calendar</button>
          <button class="nav-item" data-nav="style profile"><i data-lucide="sun"></i>Style profile</button>
        </nav>
        <div class="sidebar-bottom"><div class="sidebar-tip"><i data-lucide="sparkles"></i><div><strong>Style signal</strong><span>${profile.styleSignal}</span></div></div><button class="help-link" data-nav="help & feedback">Help & feedback <i data-lucide="arrow-up-right"></i></button></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><button class="mobile-menu" id="menu-toggle" aria-label="Open menu"><i data-lucide="menu"></i></button><div class="breadcrumb"><span>${profile.dateLabel}</span><span class="slash">/</span><strong>Discover</strong></div><div class="top-actions"><label class="search-box"><i data-lucide="search"></i><input id="search-input" type="search" placeholder="Search your edit" value="${query}" aria-label="Search your edit" /></label><button class="icon-button" data-nav="profile" aria-label="Open profile"><i data-lucide="user-round"></i></button><button class="top-avatar" data-nav="profile" aria-label="Open profile">${profile.initials}</button></div></header>
        <div class="content-wrap">
          <section class="welcome-row"><div><p class="eyebrow">YOUR DAILY EDIT</p><h1>Good morning, ${profile.name.split(' ')[0]} <span class="wave">✦</span></h1><p class="intro">A considered selection for where the day takes you.</p></div><div class="weather"><div class="weather-icon"><i data-lucide="cloud-sun"></i></div><div><strong>22° / 14°</strong><span>Light layers today</span></div></div></section>
          <section class="hero-banner"><div class="hero-copy"><span class="hero-kicker">THE SEPTEMBER NOTE</span><h2>Quiet confidence,<br/><em>beautifully considered.</em></h2><p>Pieces with good bones, soft structure, and a point of view.</p><button class="text-button" id="explore-button">Explore the edit <i data-lucide="arrow-up-right"></i></button></div><div class="hero-image"><img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85" alt="Neutral fashion edit on a clothing rack" /></div><div class="hero-stamp"><span>CURATED</span><strong>01</strong><span>/ 04</span></div></section>
          <section class="section-block"><div class="section-heading"><div><p class="eyebrow">MADE FOR YOU</p><h2>Recommended pieces</h2></div><button class="outline-button" id="show-all">View all <i data-lucide="chevron-right"></i></button></div>
            <div class="category-scroll">${categories.map((category) => `<button class="category-pill ${activeCategory === category ? 'is-active' : ''}" data-category="${category}">${category}</button>`).join('')}</div>
            <div class="product-grid">${loading ? '<div class="loading-state"><i data-lucide="sparkles"></i><p>Curating your edit...</p></div>' : recommended.length ? recommended.map((product) => productCard(product)).join('') : '<div class="empty-state"><i data-lucide="search"></i><h3>No pieces found</h3><p>Try a different search or category.</p></div>'}</div>
          </section>
          <section class="lower-grid"><div class="wardrobe-panel"><div class="section-heading"><div><p class="eyebrow">FROM YOUR WARDROBE</p><h2>Wear it this week</h2></div><button class="icon-link" data-nav="calendar">See calendar <i data-lucide="arrow-up-right"></i></button></div><div class="wardrobe-list">${wardrobeItems.map((product) => `<div class="wardrobe-item"><img src="${product.image}" alt="${product.name}"/><div><strong>${product.name}</strong><span>Last worn 12 days ago</span></div><button class="small-arrow" data-nav="${product.name}" aria-label="Open ${product.name}"><i data-lucide="arrow-up-right"></i></button></div>`).join('')}</div></div><div class="look-panel"><div class="look-top"><span class="eyebrow">LOOK OF THE DAY</span><span class="look-number">09.18</span></div><div class="look-image"><img src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=85" alt="Woman in an elegant casual outfit" /></div><div class="look-footer"><div><h3>Easy city layers</h3><p>3 pieces · 1 saved</p></div><button class="round-arrow" data-nav="look" aria-label="Open look"><i data-lucide="arrow-up-right"></i></button></div></div></section>
        </div>
      </main>
      <div class="mobile-overlay" id="overlay"></div>
    </div>
    <div class="toast ${apiError ? 'is-visible' : ''}" id="toast"><i data-lucide="${apiError ? 'x' : 'check'}"></i><span>${apiError || 'Saved to your edit'}</span></div>
  `;
  createIcons({ icons: { Heart, Search, SlidersHorizontal, Sparkles, ArrowUpRight, ChevronRight, Bookmark, Shirt, Sun, CloudSun, CalendarDays, X, Check, Menu, UserRound } });
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => { activeCategory = button.dataset.category; savedOnly = false; render(); }));
  document.querySelector('#search-input')?.addEventListener('input', (event) => { query = event.target.value; render(); document.querySelector('#search-input')?.focus(); });
  document.querySelectorAll('[data-product]').forEach((card) => {
    const open = () => showProductDetails(products.find((product) => product.id === Number(card.dataset.product)));
    card.addEventListener('click', (event) => { if (!event.target.closest('button')) open(); });
    card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
  document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', async () => {
    const id = Number(button.dataset.save);
    button.disabled = true;
    try {
      const result = await apiRequest('/api/saved', { method: 'POST', body: JSON.stringify({ productId: id }) });
      saved = new Set(result.savedIds);
      render();
      showToast(result.saved ? 'Saved to your edit' : 'Removed from saved');
    } catch (error) {
      showToast(error.message);
    }
  }));
  document.querySelectorAll('[data-feedback]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = Number(button.dataset.feedback);
    try {
      await apiRequest('/api/feedback', { method: 'POST', body: JSON.stringify({ productId: id, action: 'dismiss' }) });
      products = products.filter((product) => product.id !== id);
      render();
      showToast('We will show fewer pieces like this');
    } catch (error) {
      showToast(error.message);
    }
  }));
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => {
    const destination = button.dataset.nav;
    if (destination === 'profile' || destination === 'account menu') { showProfileEditor(); return; }
    if (destination === 'discover') { savedOnly = false; render(); document.querySelector('.section-block')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (destination === 'saved looks') { savedOnly = true; activeCategory = 'All pieces'; query = ''; render(); document.querySelector('.section-block')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (destination === 'wardrobe' || destination === 'calendar') { document.querySelector('.wardrobe-panel')?.scrollIntoView({ behavior: 'smooth' }); showToast(`${destination} is ready for your next edit`); return; }
    showToast(`${destination} is ready for your next edit`);
  }));
  document.querySelector('#show-all')?.addEventListener('click', () => { activeCategory = 'All pieces'; savedOnly = false; query = ''; render(); document.querySelector('.product-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  document.querySelector('#explore-button')?.addEventListener('click', () => document.querySelector('.section-block')?.scrollIntoView({ behavior: 'smooth' }));
  document.querySelector('#menu-toggle')?.addEventListener('click', () => { drawerOpen = true; render(); });
  document.querySelector('#overlay')?.addEventListener('click', () => { drawerOpen = false; render(); });
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const payload = await response.json();
  if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
    sessionToken = '';
    localStorage.removeItem('closetiq_token');
    renderAuth();
  }
  if (!response.ok) throw new Error(payload.error || 'Something went wrong');
  return payload;
}

async function loadApp() {
  if (!sessionToken) { renderAuth(); return; }
  loading = true;
  render();
  try {
    const data = await apiRequest('/api/bootstrap');
    profile = data.profile;
    accountEmail = data.email;
    products = data.products;
    wardrobe = data.wardrobe;
    saved = new Set(data.savedIds);
    apiError = '';
  } catch (error) {
    apiError = error.message.includes('Authentication') ? 'Your session expired. Please sign in again.' : 'Start the API with npm run api to load your edit';
  } finally {
    loading = false;
    render();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  authBusy = true;
  authError = '';
  renderAuth();
  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = { email: formData.get('email'), password: formData.get('password') };
    if (authMode === 'register') payload.name = formData.get('name');
    const result = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(payload), headers: {} });
    sessionToken = result.token;
    localStorage.setItem('closetiq_token', sessionToken);
    accountEmail = result.user.email;
    profile = result.user.profile;
    authBusy = false;
    loadApp();
  } catch (error) {
    authBusy = false;
    authError = error.message;
    renderAuth();
  }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.querySelector('span').textContent = message;
  toast.classList.add('is-visible');
  setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function showProfileEditor() {
  document.querySelector('#profile-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'profile-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><button class="modal-close" aria-label="Close profile"><i data-lucide="x"></i></button><div class="profile-modal-heading"><div class="profile-large-avatar">${profile.initials}</div><div><p class="eyebrow">YOUR PROFILE</p><h2 id="profile-modal-title">Edit your profile</h2><p>${accountEmail || 'Your personal ClosetIQ account'}</p></div></div><form id="profile-form" class="profile-form"><label class="form-field"><span>Name</span><input name="name" value="${profile.name}" required/></label><label class="form-field"><span>Style signal</span><textarea name="styleSignal" rows="3">${profile.styleSignal}</textarea></label><div class="profile-actions"><button type="button" class="profile-logout"><i data-lucide="log-out"></i>Sign out</button><button type="submit" class="modal-save"><i data-lucide="save"></i>Save profile</button></div></form></div>`;
  document.body.appendChild(modal);
  createIcons({ icons: { X, LogOut, Save } });
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.modal-close')) modal.remove(); });
  modal.querySelector('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await apiRequest('/api/profile', { method: 'PATCH', body: JSON.stringify({ name: formData.get('name'), styleSignal: formData.get('styleSignal') }) });
    profile = result.user.profile;
    modal.remove();
    render();
    showToast('Profile updated');
  });
  modal.querySelector('.profile-logout').addEventListener('click', async () => {
    await apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    sessionToken = '';
    localStorage.removeItem('closetiq_token');
    modal.remove();
    authMode = 'login';
    renderAuth();
  });
}

function showProductDetails(product) {
  if (!product) return;
  document.querySelector('#product-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'product-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><button class="modal-close" aria-label="Close product details"><i data-lucide="x"></i></button><img src="${product.image}" alt="${product.name}"/><div class="modal-copy"><p class="eyebrow">${product.category} · ${product.style}</p><h2 id="product-modal-title">${product.name}</h2><p class="modal-description">${product.note}. ${product.color} is a flexible addition to your current edit.</p><div class="modal-meta"><strong>$${product.price}</strong><span><i data-lucide="sparkles"></i>${product.match}% match</span></div><button class="modal-save" data-save="${product.id}">${saved.has(product.id) ? 'Remove from saved' : 'Save to your edit'} <i data-lucide="bookmark"></i></button></div></div>`;
  document.body.appendChild(modal);
  createIcons({ icons: { X, Sparkles, Bookmark } });
  modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.modal-close')) modal.remove(); });
  modal.querySelector('.modal-save').addEventListener('click', async () => {
    const result = await apiRequest('/api/saved', { method: 'POST', body: JSON.stringify({ productId: product.id }) });
    saved = new Set(result.savedIds);
    modal.remove();
    render();
    showToast(result.saved ? 'Saved to your edit' : 'Removed from saved');
  });
}

loadApp();
