/* ============================================================
   MentorWatch – TikTok Story Viewer  |  app.js
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────
const RAPIDAPI_KEY = 'cc945a3d43msh45c2e3b8e792458p102a43jsnd2f70d1ab92a';

const state = {
  apiKey: RAPIDAPI_KEY,
  currentUser: null,
  stories: [],
  modalIndex: 0,
  theme: 'light',
};


// ── DOM helpers ────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const el = id => document.getElementById(id);

// ── Elements ───────────────────────────────────────────────
const usernameInput   = el('usernameInput');
const searchBtn       = el('searchBtn');
const pasteBtn        = el('pasteBtn');
const resultsSection  = el('resultsSection');
const loadingOverlay  = el('loadingOverlay');
const storiesGrid     = el('storiesGrid');
const emptyState      = el('emptyState');
const backBtn         = el('backBtn');
const downloadAllBtn  = el('downloadAllBtn');
const storiesTitle    = el('storiesTitle');

// Profile
const profileAvatar   = el('profileAvatar');
const profileName     = el('profileName');
const profileUsername = el('profileUsername');
const statFollowers   = el('statFollowers');
const statFollowing   = el('statFollowing');
const statLikes       = el('statLikes');

// Modal
const storyModal      = el('storyModal');
const modalImg        = el('modalImg');
const modalVideo      = el('modalVideo');
const modalClose      = el('modalClose');
const modalPrev       = el('modalPrev');
const modalNext       = el('modalNext');
const modalCounter    = el('modalCounter');
const modalDownloadBtn= el('modalDownloadBtn');
const modalOverlay    = el('modalOverlay');
const progressFill    = el('storyProgressFill');

// API modal – removed (key is built-in)

// Theme
const themeToggle = el('themeToggle');
const toast       = el('toast');


// ── Init ───────────────────────────────────────────────────
function init() {
  // Theme
  const savedTheme = localStorage.getItem('sp_theme') || 'light';
  setTheme(savedTheme);

  // API Key is always the built-in key – no user entry needed
  state.apiKey = RAPIDAPI_KEY;

  // Events
  themeToggle.addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
  usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });
  searchBtn.addEventListener('click', handleSearch);
  pasteBtn.addEventListener('click', handlePaste);
  backBtn.addEventListener('click', showHero);
  downloadAllBtn.addEventListener('click', downloadAll);

  // Hint chips
  $$('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      usernameInput.value = chip.dataset.user;
      usernameInput.focus();
    });
  });

  // Modal
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  modalPrev.addEventListener('click', () => navigateModal(-1));
  modalNext.addEventListener('click', () => navigateModal(1));
  modalDownloadBtn.addEventListener('click', downloadCurrent);
  document.addEventListener('keydown', handleKeyboard);
}

// ── Theme ──────────────────────────────────────────────────
function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sp_theme', theme);
}


async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    usernameInput.value = text.replace(/^@/, '').trim();
    usernameInput.focus();
  } catch {
    showToast('Pano erişimi reddedildi. Lütfen manuel yapıştırın (Ctrl+V).', 'error');
  }
}

// ── Search ─────────────────────────────────────────────────
async function handleSearch() {
  const raw = usernameInput.value.trim().replace(/^@/, '');
  if (!raw) {
    shakeInput();
    showToast('Lütfen bir kullanıcı adı girin.', 'error');
    return;
  }
  fetchStories(raw);
}

function shakeInput() {
  usernameInput.parentElement.style.animation = 'shake 0.4s ease';
  usernameInput.parentElement.addEventListener('animationend', () => {
    usernameInput.parentElement.style.animation = '';
  }, { once: true });
}

// Add shake animation if not in CSS
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

// ── Fetch Stories ──────────────────────────────────────────
async function fetchStories(username) {
  showLoading(true);
  searchBtn.disabled = true;

  try {
    // First fetch user info (to get secUid + UserStoryStatus)
    const userInfo = await fetchUserInfo(username);
    if (!userInfo) throw new Error('Kullanıcı bulunamadı.');

    const user = userInfo.user || userInfo;

    // Check if user has active stories (UserStoryStatus 1 = has story)
    // 0 = no story, but we still try to fetch anyway to be sure
    const storyStatus = user.UserStoryStatus ?? user.userStoryStatus ?? -1;
    console.log('[StoryPeek] UserStoryStatus:', storyStatus, '| user:', user.uniqueId);

    // Fetch stories by unique_id first, fallback to secUid if empty
    let stories = await fetchUserStories(username, null);

    // If no stories and we have secUid, try that too
    if (stories.length === 0 && user.secUid) {
      console.log('[StoryPeek] Retrying with secUid...');
      stories = await fetchUserStories(null, user.secUid);
    }

    state.currentUser = userInfo;
    state.stories = stories;

    showResults(userInfo, state.stories);
  } catch (err) {
    console.error('[StoryPeek] Error:', err);
    showToast(err.message || 'Bir hata oluştu. API anahtarınızı kontrol edin.', 'error');
  } finally {
    showLoading(false);
    searchBtn.disabled = false;
  }
}

// ── API Calls ──────────────────────────────────────────────
async function fetchUserInfo(username) {
  const opts = {
    method: 'GET',
    headers: {
      'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
      'x-rapidapi-key': state.apiKey,
    },
  };

  const url = `https://tiktok-scraper7.p.rapidapi.com/user/info?unique_id=${encodeURIComponent(username)}`;
  const res = await fetch(url, opts);
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) throw new Error('Geçersiz API anahtarı. Lütfen anahtarınızı kontrol edin.');
    throw new Error(`API hatası: ${res.status}`);
  }
  const data = await res.json();
  if (!data.data) throw new Error('Kullanıcı bulunamadı.');
  return data.data;
}

async function fetchUserStories(username, secUid) {
  const headers = {
    'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
    'x-rapidapi-key': state.apiKey,
  };

  // Build query params: prefer secUid since it's more reliable
  let query;
  if (secUid) {
    query = `sec_uid=${encodeURIComponent(secUid)}`;
  } else {
    query = `unique_id=${encodeURIComponent(username)}`;
  }

  const url = `https://tiktok-scraper7.p.rapidapi.com/user/story?${query}`;
  console.log('[StoryPeek] Story URL:', url);

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error(`Hikayeler alınamadı: ${res.status}`);
  const data = await res.json();
  console.log('[StoryPeek] Story raw response:', JSON.stringify(data).slice(0, 300));
  return parseStories(data);
}

function parseStories(data) {
  // TikTok Scraper7 API: data.data.videos array
  // Each item can be video or image story
  const rawData = data?.data || data;
  const items = rawData?.videos
    || rawData?.aweme_list
    || rawData?.story_list
    || rawData?.items
    || (Array.isArray(rawData) ? rawData : []);

  if (!Array.isArray(items) || items.length === 0) return [];

  return items.map((item, idx) => {
    // Video story fields (TikTok Scraper7)
    const isVideo = !!(item.play || item.hdplay || item.video?.play_addr?.url_list?.length
      || item.video_url || item.video_play_url);

    // Thumbnail: try multiple possible field names
    const thumb = item.cover
      || item.origin_cover
      || item.dynamic_cover
      || item.video?.cover?.url_list?.[0]
      || item.image_url
      || item.thumbnail_url
      || item.image?.url_list?.[0]
      || '';

    // Video URL
    const videoUrl = item.hdplay
      || item.play
      || item.wmplay
      || item.video?.play_addr?.url_list?.[0]
      || item.video_url
      || item.video_play_url
      || '';

    // Image URL (for photo stories)
    const imageUrl = item.image_url
      || item.image?.url_list?.[0]
      || item.cover
      || thumb;

    return {
      id: item.aweme_id || item.id || String(idx),
      type: isVideo ? 'video' : 'image',
      thumb,
      url: isVideo ? videoUrl : imageUrl,
      downloadUrl: isVideo ? (item.hdplay || videoUrl) : imageUrl,
    };
  }).filter(s => s.url || s.thumb);
}

// ── Show Results ───────────────────────────────────────────
function showResults(userInfo, stories) {
  // TikTok Scraper7 API returns: data.user (camelCase) + data.stats (camelCase)
  const user  = userInfo.user  || userInfo;
  const stats = userInfo.stats || {};

  // Profile info – API uses camelCase: uniqueId, nickname, followerCount etc.
  const nickname  = user.nickname  || user.name        || user.unique_id  || user.uniqueId || 'İsimsiz';
  const uniqueId  = user.uniqueId  || user.unique_id   || user.username   || '';
  profileName.textContent     = nickname;
  profileUsername.textContent = '@' + uniqueId;

  // Stats – API uses camelCase
  statFollowers.textContent = formatNum(
    stats.followerCount  || stats.follower_count  || stats.followers || 0
  );
  statFollowing.textContent = formatNum(
    stats.followingCount || stats.following_count || stats.following || 0
  );
  statLikes.textContent = formatNum(
    stats.heartCount     || stats.heart_count     || stats.heart     || stats.likes || 0
  );

  // Avatar – API returns direct string URL (not url_list)
  const avatarUrl = user.avatarThumb
    || user.avatarMedium
    || user.avatarLarger
    || user.avatar_thumb?.url_list?.[0]
    || user.avatar_medium?.url_list?.[0]
    || user.avatar_url
    || user.avatar
    || '';

  if (avatarUrl) {
    profileAvatar.src = avatarUrl;
    profileAvatar.style.display = 'block';
    profileAvatar.onerror = () => { profileAvatar.src = generatePlaceholderAvatar(nickname); };
  } else {
    profileAvatar.src = generatePlaceholderAvatar(nickname);
  }

  // Stories
  storiesGrid.innerHTML = '';
  emptyState.style.display = 'none';

  if (stories.length === 0) {
    emptyState.style.display = 'block';
    storiesTitle.textContent = 'Hikayeler (0)';
  } else {
    storiesTitle.textContent = `Hikayeler (${stories.length})`;
    stories.forEach((story, idx) => {
      const item = createStoryCard(story, idx);
      storiesGrid.appendChild(item);
    });
  }

  // Show results section, hide search hero content
  document.getElementById('search-section').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => {
    resultsSection.style.display = 'block';
    document.querySelector('.hero').style.paddingBottom = '0';
    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function generatePlaceholderAvatar(name) {
  const initials = name.slice(0, 2).toUpperCase();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 80;
  const ctx2 = canvas.getContext('2d');
  const grad = ctx2.createLinearGradient(0,0,80,80);
  grad.addColorStop(0, '#ee1d52');
  grad.addColorStop(1, '#69c9d0');
  ctx2.fillStyle = grad;
  ctx2.fillRect(0,0,80,80);
  ctx2.fillStyle = '#fff';
  ctx2.font = 'bold 28px Inter, sans-serif';
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  ctx2.fillText(initials, 40, 42);
  return canvas.toDataURL();
}

function createStoryCard(story, idx) {
  const div = document.createElement('div');
  div.className = 'story-item';
  div.setAttribute('data-idx', idx);

  const thumbSrc = story.thumb || story.url;
  const isVideo = story.type === 'video';

  div.innerHTML = `
    ${thumbSrc ? `<img class="story-thumb" src="${thumbSrc}" alt="Hikaye ${idx+1}" loading="lazy" onerror="this.src='${generateGradientPlaceholder()}'"/>` : `<div class="story-thumb" style="background:var(--gradient);height:100%;"></div>`}
    <div class="story-type-badge">
      ${isVideo
        ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Video`
        : `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg> Fotoğraf`
      }
    </div>
    ${isVideo ? `
      <div class="story-video-indicator">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
      </div>` : ''}
    <div class="story-overlay">
      <button class="story-download-btn" aria-label="İndir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        İndir
      </button>
    </div>
  `;

  // Open modal on click (but not on download button)
  div.addEventListener('click', e => {
    if (e.target.closest('.story-download-btn')) {
      e.stopPropagation();
      downloadStory(story, idx);
    } else {
      openModal(idx);
    }
  });

  return div;
}

function generateGradientPlaceholder() {
  const canvas = document.createElement('canvas');
  canvas.width = 180; canvas.height = 320;
  const ctx2 = canvas.getContext('2d');
  const grad = ctx2.createLinearGradient(0,0,180,320);
  grad.addColorStop(0, '#1a1e30');
  grad.addColorStop(1, '#2a1530');
  ctx2.fillStyle = grad;
  ctx2.fillRect(0,0,180,320);
  return canvas.toDataURL();
}

// ── Show Hero ──────────────────────────────────────────────
function showHero() {
  resultsSection.style.display = 'none';
  document.querySelector('.hero').style.paddingBottom = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Format Numbers ─────────────────────────────────────────
function formatNum(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n/1_000).toFixed(1) + 'K';
  return String(n);
}

// ── Loading ────────────────────────────────────────────────
function showLoading(show) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
}

// ── Modal ─────────────────────────────────────────────────
function openModal(idx) {
  state.modalIndex = idx;
  storyModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderModal();
}

function closeModal() {
  storyModal.style.display = 'none';
  document.body.style.overflow = '';
  modalVideo.pause();
  modalVideo.src = '';
}

function navigateModal(dir) {
  state.modalIndex = Math.max(0, Math.min(state.stories.length - 1, state.modalIndex + dir));
  renderModal();
}

function renderModal() {
  const story = state.stories[state.modalIndex];
  if (!story) return;

  const total = state.stories.length;
  modalCounter.textContent = `${state.modalIndex + 1} / ${total}`;
  modalPrev.disabled = state.modalIndex === 0;
  modalNext.disabled = state.modalIndex === total - 1;

  // Update progress
  progressFill.style.width = `${((state.modalIndex + 1) / total) * 100}%`;

  // Media
  modalVideo.pause();
  modalVideo.removeAttribute('src');
  modalVideo.load();
  if (story.type === 'video' && story.url) {
    modalImg.style.display   = 'none';
    modalVideo.style.display = 'block';
    modalVideo.crossOrigin   = 'anonymous';
    modalVideo.src           = story.url;
    modalVideo.load();
    modalVideo.play().catch(() => {
      // Autoplay blocked – video controls are shown, user can press play
    });
  } else {
    modalVideo.style.display = 'none';
    modalImg.style.display   = 'block';
    modalImg.crossOrigin     = 'anonymous';
    modalImg.src             = story.url || story.thumb;
    modalImg.alt             = `Hikaye ${state.modalIndex + 1}`;
  }
}

function handleKeyboard(e) {
  if (storyModal.style.display !== 'flex') return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowLeft')  navigateModal(-1);
  if (e.key === 'ArrowRight') navigateModal(1);
}

// ── Download ───────────────────────────────────────────────
function downloadCurrent() {
  const story = state.stories[state.modalIndex];
  if (story) downloadStory(story, state.modalIndex);
}

async function downloadStory(story, idx) {
  const url = story.downloadUrl || story.url;
  if (!url) { showToast('İndirme URL\'si bulunamadı.', 'error'); return; }

  showToast('İndiriliyor...', 'info');

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Bağlantı hatası');
    const blob = await res.blob();
    const ext  = story.type === 'video' ? 'mp4' : 'jpg';
    const u = state.currentUser?.user;
    const uname = u?.uniqueId || u?.unique_id || 'story';
    const filename = `storypeek_${uname}_${idx+1}.${ext}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('İndirildi! ✓', 'success');
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank', 'noopener');
    showToast('Yeni sekmede açıldı. Oradan kaydedebilirsiniz.', 'info');
  }
}

async function downloadAll() {
  if (state.stories.length === 0) return;
  showToast(`${state.stories.length} hikaye indiriliyor...`, 'info');
  for (let i = 0; i < state.stories.length; i++) {
    await new Promise(r => setTimeout(r, 300 * i));
    downloadStory(state.stories[i], i);
  }
}

// API Key Modal – removed (key is built-in)

// ── Toast ──────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  _toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}

// ── Start ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
