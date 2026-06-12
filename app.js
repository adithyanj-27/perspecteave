/* ============================================
   PerspecTEAve — Application Logic (Supabase Enabled)
   ============================================ */

import { supabase, isConfigured } from './supabaseClient.js';

// ---- Default posts (seed data) ----
const DEFAULT_POSTS = [
  {
    id: 1,
    question: 'Should political borders define our cultural identity?',
    perspective: 'Geography naturally shapes how we live — the food we eat, the languages we speak, the stories we tell. But enforcing strict cultural identities based purely on modern political borders often ignores the shared history of neighboring regions. The Basque culture straddles France and Spain. Bengali identity flows across India and Bangladesh. True culture is fluid and bleeds across lines drawn on a map by politicians, generals, and colonial cartographers. Maybe identity should be a river, not a fence.',
    edit_count: 0,
    agrees: 12,
    disagrees: 2
  },
  {
    id: 2,
    question: 'Does absolute connectivity alienate us from our immediate reality?',
    perspective: 'We can video-call someone across the planet in real time, yet we don\'t know our neighbor\'s name. Social media promised to bring us closer but created curated highlight reels instead of genuine connection. The paradox is sharp: we are more "connected" than any generation before us and simultaneously lonelier. Perhaps the issue isn\'t the tool but the illusion — the belief that watching someone\'s life is the same as being part of it.',
    edit_count: 0,
    agrees: 8,
    disagrees: 4
  },
  {
    id: 3,
    question: 'If ethical progress is inevitable, why do moral values cycle over generations?',
    perspective: 'Every generation believes it\'s more morally evolved than the last. Yet history suggests moral stances oscillate rather than march in a straight line. The liberalism of the Roaring Twenties gave way to the conservatism of the 1950s. Empires that championed pluralism eventually collapsed into xenophobia. Perhaps "progress" isn\'t a destination but a pendulum — and the real question is whether we can learn to keep the pendulum from swinging too far in either direction.',
    edit_count: 0,
    agrees: 15,
    disagrees: 3
  }
];

// ---- Seed comments ----
const SEED_COMMENTS = {
  1: [
    { name: 'Riya M.', text: 'Geography naturally creates shared identities that maps can\'t fully divide. This resonates a lot with my experience living in border areas.', time: '2 days ago' },
    { name: 'Karthik S.', text: 'The argument assumes culture is always fluid, but some cultural traditions are deeply rooted in specific geographies and would not exist without those boundaries.', time: '1 day ago' }
  ],
  2: [
    { name: 'Priya T.', text: 'A 2023 study in the Journal of Social Psychology found that people who limited social media to 30 min/day reported 25% higher well-being scores. Supports your point.', time: '3 hours ago' },
    { name: 'Anonymous', text: 'When you say "absolute connectivity", are you including passive consumption (scrolling feeds) or only active interaction (messaging, video calls)?', time: '5 hours ago' }
  ],
  3: [
    { name: 'Anonymous', text: 'This is a great description of history. We see moral tides rise and fall all the time.', time: '1 day ago' },
    { name: 'Dev A.', text: 'Maybe moral values don\'t actually cycle — perhaps each generation redefines the same core values using the language and symbols of their own era.', time: '12 hours ago' }
  ]
};

const POSTS_KEY = 'perspecteave_posts_v3';
const COMMENTS_KEY = 'perspecteave_comments_v3';

// ---- App State Variables ----
let appPosts = [];
let appComments = {};
let currentSession = null;
let guestTimerTimeout = null;
let globalOpenAuthModal = null;


// ---- Storage Helpers (Local Fallback) ----
function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('Storage read error:', e); }
  return null;
}

function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { console.warn('Storage write error:', e); }
}

// ---- Time Formatter Helper ----
function formatTime(timestampString) {
  if (!timestampString) return 'Just now';
  const date = new Date(timestampString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  return `${diffDay} days ago`;
}

// ---- Fetching Data ----
async function fetchPosts() {
  if (!isConfigured) {
    let posts = load(POSTS_KEY);
    if (!posts) {
      posts = DEFAULT_POSTS;
      save(POSTS_KEY, posts);
    }
    return posts;
  }

  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching posts from Supabase:', err);
    return load(POSTS_KEY) || [];
  }
}

async function fetchComments() {
  if (!isConfigured) {
    let comments = load(COMMENTS_KEY);
    if (!comments) {
      comments = {};
      // Deep copy seed comments and initialize them with deterministic IDs and history
      for (const postId in SEED_COMMENTS) {
        comments[postId] = SEED_COMMENTS[postId].map((c, idx) => ({
          id: Number(postId) * 1000 + idx + 1,
          name: c.name,
          text: c.text,
          time: c.time,
          edited: false,
          history: []
        }));
      }
      save(COMMENTS_KEY, comments);
    } else {
      // Ensure all loaded comments have IDs and history arrays
      let modified = false;
      for (const postId in comments) {
        comments[postId] = comments[postId].map((c, idx) => {
          let needsUpdate = false;
          const updated = { ...c };
          if (!updated.id) {
            updated.id = Date.now() + Math.floor(Math.random() * 1000000) + idx;
            needsUpdate = true;
          }
          if (updated.edited === undefined) {
            updated.edited = false;
            needsUpdate = true;
          }
          if (!updated.history) {
            updated.history = [];
            needsUpdate = true;
          }
          if (needsUpdate) modified = true;
          return updated;
        });
      }
      if (modified) save(COMMENTS_KEY, comments);
    }
    return comments;
  }

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const commentsMap = {};
    appPosts.forEach(post => {
      commentsMap[post.id] = [];
    });

    data.forEach(item => {
      const postId = item.post_id;
      if (!commentsMap[postId]) {
        commentsMap[postId] = [];
      }
      commentsMap[postId].push({
        id: item.id,
        name: item.name,
        text: item.text,
        edited: item.edited || false,
        history: item.history || [],
        time: formatTime(item.created_at)
      });
    });

    return commentsMap;
  } catch (err) {
    console.error('Error fetching comments from Supabase:', err);
    return load(COMMENTS_KEY) || SEED_COMMENTS;
  }
}

// ---- HTML Helpers ----
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Local Comment Ownership Helpers ----
function canEditComment(commentId, authorName) {
  const myComments = JSON.parse(localStorage.getItem('perspecteave_my_comments') || '[]');
  const idStr = String(commentId);
  if (myComments.map(String).includes(idStr)) return true;
  
  // Also check if logged in as the author of the comment
  const loggedIn = isLoggedIn(currentSession);
  if (loggedIn && authorName) {
    const username = getCurrentUsername(currentSession);
    if (username && username.trim().toLowerCase() === authorName.trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

function saveCommentOwnership(commentId) {
  const myComments = JSON.parse(localStorage.getItem('perspecteave_my_comments') || '[]');
  const idStr = String(commentId);
  if (!myComments.map(String).includes(idStr)) {
    myComments.push(commentId);
    localStorage.setItem('perspecteave_my_comments', JSON.stringify(myComments));
  }
}

function hasSubmittedComment(postId) {
  const postComments = appComments[postId] || [];
  const myComments = JSON.parse(localStorage.getItem('perspecteave_my_comments') || '[]');
  
  // Check local storage ownership
  const hasLocalOwnership = postComments.some(c => myComments.map(String).includes(String(c.id)));
  if (hasLocalOwnership) return true;
  
  // Check if logged-in user matches any comment author name
  const loggedIn = isLoggedIn(currentSession);
  if (loggedIn) {
    const username = getCurrentUsername(currentSession);
    if (username) {
      const hasNamedComment = postComments.some(c => 
        c.name && c.name.trim().toLowerCase() === username.trim().toLowerCase()
      );
      if (hasNamedComment) return true;
    }
  }
  return false;
}

// ---- Local Votes Toggling Helpers ----
function getPostVote(postId) {
  const votes = JSON.parse(localStorage.getItem('perspecteave_votes') || '{}');
  return votes[Number(postId)] || null; // 'agree', 'disagree' or null
}

function setPostVote(postId, voteType) {
  const votes = JSON.parse(localStorage.getItem('perspecteave_votes') || '{}');
  const id = Number(postId);
  if (voteType) {
    votes[id] = voteType;
  } else {
    delete votes[id];
  }
  localStorage.setItem('perspecteave_votes', JSON.stringify(votes));
}

// ---- Email Verification & Guest Restrictions Helpers ----
function isClientVerified(session) {
  return isLoggedIn(session);
}

// 10-Minute Guest Timer Logic
function setupGuestTimer() {
  const timeLockOverlay = document.getElementById('timeLockOverlay');
  if (!timeLockOverlay) return;

  // Clear any existing timeout
  if (guestTimerTimeout) {
    clearTimeout(guestTimerTimeout);
    guestTimerTimeout = null;
  }

  const loggedIn = isLoggedIn(currentSession);
  if (loggedIn) {
    // Logged in user: hide time lock overlay and clear first visit timestamp
    timeLockOverlay.classList.remove('open');
    document.body.style.overflow = '';
    localStorage.removeItem('perspecteave_first_visit');
    return;
  }

  // Guest user
  let firstVisit = localStorage.getItem('perspecteave_first_visit');
  if (!firstVisit) {
    firstVisit = Date.now().toString();
    localStorage.setItem('perspecteave_first_visit', firstVisit);
  }

  const elapsed = Date.now() - Number(firstVisit);
  const limit = 600000; // 10 minutes in milliseconds

  if (elapsed >= limit) {
    // Time limit reached
    timeLockOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  } else {
    // Time limit not reached yet: set timer for remaining time
    timeLockOverlay.classList.remove('open');
    document.body.style.overflow = '';
    const remaining = limit - elapsed;
    guestTimerTimeout = setTimeout(() => {
      timeLockOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }, remaining);
  }
}

function triggerAsmrEffect(button, isDisagree = false) {
  const rect = button.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // 1. Text Pop
  const phrase = isDisagree ? 'Hmm why? 🤔' : 'Yes! 👍';
  const removeTimeout = isDisagree ? 1750 : 2200;
  const particleTimeout = isDisagree ? 1750 : 1800;
  
  const textPop = document.createElement('div');
  textPop.className = isDisagree ? 'asmr-text-pop disagree' : 'asmr-text-pop';
  textPop.textContent = phrase;
  textPop.style.left = `${centerX}px`;
  textPop.style.top = `${centerY - 20}px`;
  document.body.appendChild(textPop);
  
  setTimeout(() => textPop.remove(), removeTimeout);

  // 2. Emoji Particles (👍 or 🤔)
  const particleEmoji = isDisagree ? '🤔' : '👍';
  const numParticles = isDisagree ? 4 + Math.floor(Math.random() * 3) : 10 + Math.floor(Math.random() * 5); // Very few particles for disagree
  const maxDistance = isDisagree ? 30 : 80;
  
  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('div');
    particle.className = 'asmr-particle';
    particle.textContent = particleEmoji;
    if (isDisagree) {
      particle.style.fontSize = `${1.0 + Math.random() * 0.3}rem`; // Slightly smaller particles for disagree
      particle.style.animationDuration = '1.75s';
    }
    
    particle.style.left = `${centerX - 10}px`;
    particle.style.top = `${centerY - 10}px`;
    
    const angle = isDisagree ? (-Math.PI / 2 + (Math.random() * 0.4 - 0.2)) : (Math.random() * Math.PI * 2);
    const distance = isDisagree ? (20 + Math.random() * 25) : (40 + Math.random() * maxDistance);
    const dx = Math.cos(angle) * distance;
    const dy = isDisagree ? (Math.sin(angle) * distance) : (Math.sin(angle) * distance - 30);
    const rot = isDisagree ? (-15 + Math.random() * 30) : (-180 + Math.random() * 360);
    
    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    particle.style.setProperty('--rot', `${rot}deg`);
    
    document.body.appendChild(particle);
    
    setTimeout(() => particle.remove(), particleTimeout);
  }
}



// ---- Render a Single Entry ----
function renderEntry(post, index) {
  const qNum = `Q${index + 1}`;
  let editInfo = '';
  if (post.edit_count > 0) {
    editInfo = ` <span class="edit-info">(edited ${post.edit_count} time${post.edit_count > 1 ? 's' : ''})</span>`;
  }

  const currentVote = getPostVote(post.id);
  const agreeClass = currentVote === 'agree' ? 'active' : '';
  const disagreeClass = currentVote === 'disagree' ? 'active' : '';
  const replyOpenClass = currentVote === 'disagree' ? 'open' : '';

  return `
    <article class="entry" data-entry-id="${post.id}" id="entry-${post.id}">
      <div class="entry-summary">
        <div class="entry-number">${qNum}</div>
        <h2 class="question" id="entryQuestionText-${post.id}">${escapeHTML(post.question)}</h2>
        <div class="expand-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="arrow-svg"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
      <div class="entry-body">
        
        <!-- Static Perspective Content -->
        <div class="entry-static-view" id="entryStatic-${post.id}">
          <p class="perspective">${escapeHTML(post.perspective)}${editInfo}</p>
          
          <!-- Admin actions (only visible to admin) -->
          <div class="entry-admin-actions" data-entry-id="${post.id}">
            <button type="button" class="btn-entry-edit" data-entry-id="${post.id}">Edit</button>
            <button type="button" class="btn-entry-delete" data-entry-id="${post.id}">Delete</button>
          </div>
        </div>

        <!-- Inline Edit Form (Hidden by default) -->
        <form class="entry-edit-form" id="entryEdit-${post.id}" onsubmit="return false;" style="display: none;">
          <div class="edit-field">
            <label>Question</label>
            <input type="text" class="edit-question-input" id="editQuestion-${post.id}" value="${escapeHTML(post.question)}" required>
          </div>
          <div class="edit-field">
            <label>Perspective</label>
            <textarea class="edit-perspective-textarea" id="editPerspective-${post.id}" required>${escapeHTML(post.perspective)}</textarea>
          </div>
          <div class="edit-actions">
            <button type="button" class="btn-edit-save" data-entry-id="${post.id}">Save</button>
            <button type="button" class="btn-edit-cancel" data-entry-id="${post.id}">Cancel</button>
          </div>
        </form>

        <!-- Social Action Buttons (Do you agree? + Comments count) -->
        <div class="entry-actions-row">
          <div class="agree-question-wrapper">
            <span class="agree-label">Do you agree?</span>
            <div class="agree-buttons">
              <button type="button" class="btn-vote btn-agree ${agreeClass}" data-entry-id="${post.id}">
                <span class="vote-icon">👍</span>
                <span class="vote-count" id="agreeCount-${post.id}">${post.agrees || 0}</span>
              </button>
              <button type="button" class="btn-vote btn-disagree ${disagreeClass}" data-entry-id="${post.id}">
                <span class="vote-icon">👎</span>
                <span class="vote-count" id="disagreeCount-${post.id}">${post.disagrees || 0}</span>
              </button>
            </div>
          </div>
          
          <button type="button" class="btn-view-comments" data-entry-id="${post.id}">
            <span class="comment-icon">💬</span>
            <span>Comments</span>
            <span class="total-comment-count" id="totalCount-${post.id}">0</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="comments-arrow"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>

        <!-- Conditional Critique Form (Only shown if thumbs down is clicked) -->
        <div class="reply-section ${replyOpenClass}" id="replySection-${post.id}">
          <h3 class="reply-section-title">Why do you disagree?</h3>
          <form class="reply-form" data-entry-id="${post.id}" onsubmit="return false;">
            <input type="text" class="reply-name" placeholder="Your name">
            <div class="textarea-wrapper">
              <textarea class="reply-text" placeholder="Write your counterpoint..."></textarea>
              <button type="button" class="btn-submit-circle btn-reply" data-entry-id="${post.id}" title="Submit criticism">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          </form>
        </div>

        <!-- Collapsible Comments Feed -->
        <div class="comments-section">
          <div class="comments-body" id="commentsBody-${post.id}">
            <ul class="comments-list" id="commentsList-${post.id}"></ul>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Render a single comment card
function renderCommentCard(item) {
  const editable = canEditComment(item.id, item.name);
  const editButton = editable ? `
    <button type="button" class="btn-comment-edit" data-comment-id="${item.id}">Edit</button>
  ` : '';
  
  const hasHistory = item.history && item.history.length > 0;
  const totalVersions = hasHistory ? item.history.length + 1 : 1;
  const historyNav = hasHistory ? `
    <div class="comment-history-nav" data-comment-id="${item.id}" data-current-index="${item.history.length}" data-total-versions="${totalVersions}">
      <button type="button" class="btn-comment-undo" data-comment-id="${item.id}" title="Show previous version">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
      </button>
      <span class="comment-version-indicator" id="versionIndicator-${item.id}">v${totalVersions}/${totalVersions}</span>
      <button type="button" class="btn-comment-redo" data-comment-id="${item.id}" title="Show next version" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
      </button>
    </div>
  ` : '';

  return `
    <li class="comment-card" id="comment-${item.id}">
      <div class="comment-card-static" id="commentStatic-${item.id}">
        <div class="comment-card-meta">
          <div>
            <span class="comment-card-author">${escapeHTML(item.name || 'Anonymous')}</span>
            ${item.edited ? `<span class="comment-edited-tag">(edited)</span>` : ''}
          </div>
          <div class="comment-meta-right">
            <span class="comment-card-time">${escapeHTML(item.time || 'Just now')}</span>
            ${historyNav}
            ${editButton}
          </div>
        </div>
        <p class="comment-card-text">${escapeHTML(item.text)}</p>
      </div>
      
      <!-- Inline Comment Edit Form (Hidden by default) -->
      <form class="comment-edit-form" id="commentEdit-${item.id}" onsubmit="return false;" style="display: none;">
        <textarea class="comment-edit-textarea" id="commentEditTextarea-${item.id}" required>${escapeHTML(item.text)}</textarea>
        <div class="comment-edit-actions">
          <button type="button" class="btn-comment-save" data-comment-id="${item.id}">Save</button>
          <button type="button" class="btn-comment-cancel" data-comment-id="${item.id}">Cancel</button>
        </div>
      </form>
    </li>
  `;
}

// ---- Render all entries ----
function renderAllEntries(posts) {
  const container = document.getElementById('entriesList');
  if (container) {
    container.innerHTML = posts.map((p, i) => renderEntry(p, i)).join('');
  }
}

// ---- Render comments for one entry ----
function renderComments(entryId, comments) {
  const list = comments[entryId] || [];
  const listEl = document.getElementById(`commentsList-${entryId}`);
  const tCount = document.getElementById(`totalCount-${entryId}`);

  if (listEl) {
    let html = list.length
      ? list.map(renderCommentCard).join('')
      : '<li class="no-comments">None yet.</li>';

    if (!isLoggedIn(currentSession)) {
      html += `
        <li class="comment-login-prompt" style="list-style: none; margin-top: var(--space-md); text-align: center; padding: var(--space-sm); border: 1px dashed var(--border-light); border-radius: var(--radius-sm); background: rgba(214, 142, 73, 0.03);">
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: var(--space-xs); font-family: var(--font-body);">Want to share your perspective?</p>
          <a href="#" class="btn-comment-login-trigger" style="font-size: 0.82rem; font-weight: 600; color: var(--accent-matcha); text-decoration: none; font-family: var(--font-body);">Log in or Sign up to comment</a>
        </li>
      `;
    }
    listEl.innerHTML = html;
  }
  if (tCount) tCount.textContent = list.length;

  // Toggle disabled state of the agree (thumbs up) button if the user has commented
  const hasCommented = hasSubmittedComment(entryId);
  const agreeBtn = document.querySelector(`.btn-agree[data-entry-id="${entryId}"]`);
  if (agreeBtn) {
    if (hasCommented) {
      agreeBtn.classList.add('disabled');
    } else {
      agreeBtn.classList.remove('disabled');
    }
  }
}

// ---- Get current logged-in username ----
function getCurrentUsername(session) {
  if (sessionStorage.getItem('perspecteave_auth_is_guest') === 'true') {
    return sessionStorage.getItem('perspecteave_auth_username') || 'Guest';
  }
  if (isConfigured) {
    return session?.user?.user_metadata?.username || session?.user?.email || 'Anonymous';
  }
  return sessionStorage.getItem('perspecteave_auth_username') || 'Anonymous';
}

// ---- Submit a reply ----
async function submitReply(entryId) {
  const entry = document.querySelector(`.entry[data-entry-id="${entryId}"]`);
  const form = entry.querySelector(`.reply-form`);
  const nameInput = form.querySelector('.reply-name');
  const textArea = form.querySelector('.reply-text');
  const btn = form.querySelector('.btn-reply');

  const text = (textArea.value || '').trim();
  if (!text) {
    textArea.style.borderColor = 'var(--accent-tea)';
    textArea.focus();
    setTimeout(() => { textArea.style.borderColor = ''; }, 1500);
    return;
  }

  if (!isLoggedIn(currentSession)) {
    alert('Please log in or sign up to post a comment.');
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.classList.add('open');
    return;
  }

  // Get active session
  let session = null;
  if (isConfigured) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } else {
    session = currentSession;
  }
  
  const loggedIn = isLoggedIn(session);
  let name = '';

  if (loggedIn) {
    name = getCurrentUsername(session);
  } else {
    name = (nameInput.value || '').trim();
    if (!name) {
      nameInput.style.borderColor = 'var(--accent-tea)';
      nameInput.focus();
      setTimeout(() => { nameInput.style.borderColor = ''; }, 1500);
      alert('Please enter your name to post a comment.');
      return;
    }
  }

  if (!isConfigured) {
    // Local fallback logic
    if (!appComments[entryId]) appComments[entryId] = [];
    const newCommentId = Date.now() + Math.floor(Math.random() * 1000);
    appComments[entryId].push({
      id: newCommentId,
      name,
      text,
      edited: false,
      history: [],
      time: 'Just now'
    });
    save(COMMENTS_KEY, appComments);
    saveCommentOwnership(newCommentId);
    renderComments(entryId, appComments);
  } else {
    // Live database logic
    try {
      btn.disabled = true;
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: entryId,
          type: 'critique', // Consolidated to critique type for consistency
          name,
          text
        })
        .select('*')
        .single();

      if (error) throw error;

      if (!appComments[entryId]) appComments[entryId] = [];
      appComments[entryId].push({
        id: data.id,
        name: data.name,
        text: data.text,
        edited: data.edited || false,
        history: data.history || [],
        time: 'Just now'
      });
      saveCommentOwnership(data.id);
      renderComments(entryId, appComments);
    } catch (err) {
      console.error('Error submitting comment to Supabase:', err);
      alert('Could not submit comment to the database. Check console for details.');
      return;
    } finally {
      btn.disabled = false;
    }
  }

  // Clear fields (name input won't change if locked)
  if (!loggedIn) {
    nameInput.value = '';
  }
  textArea.value = '';

  const origHTML = btn.innerHTML;
  btn.innerHTML = '✓';
  btn.classList.add('submitted');
  
  // Dynamic UI actions on success:
  // 1. Open the comments feed section
  const commentsBody = document.getElementById(`commentsBody-${entryId}`);
  const viewCommentsBtn = document.querySelector(`.btn-view-comments[data-entry-id="${entryId}"]`);
  if (commentsBody && !commentsBody.classList.contains('open')) {
    commentsBody.classList.add('open');
  }
  if (viewCommentsBtn && !viewCommentsBtn.classList.contains('open')) {
    viewCommentsBtn.classList.add('open');
  }

  // 2. Hide the criticism reply box smoothly
  const replySection = document.getElementById(`replySection-${entryId}`);
  if (replySection) {
    replySection.classList.remove('open');
  }

  // 3. Smoothly scroll to the comments area to show the new comment
  setTimeout(() => {
    btn.innerHTML = origHTML;
    btn.classList.remove('submitted');
    
    const commentsList = document.getElementById(`commentsList-${entryId}`);
    const lastComment = commentsList ? commentsList.lastElementChild : null;
    if (lastComment) {
      lastComment.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (commentsBody) {
      commentsBody.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 400);
}

// ---- Save Comment Edit ----
async function saveCommentEdit(commentId) {
  let entryId = null;
  let commentIndex = -1;
  
  for (const postId in appComments) {
    const idx = appComments[postId].findIndex(c => c.id === commentId);
    if (idx !== -1) {
      entryId = Number(postId);
      commentIndex = idx;
      break;
    }
  }
  
  if (entryId === null || commentIndex === -1) return;
  
  const textarea = document.getElementById(`commentEditTextarea-${commentId}`);
  const newText = (textarea.value || '').trim();
  
  if (!newText) {
    alert('Comment cannot be empty.');
    return;
  }
  
  const saveBtn = document.querySelector(`.btn-comment-save[data-comment-id="${commentId}"]`);
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }
  
  const currentComment = appComments[entryId][commentIndex];
  const updatedHistory = [...(currentComment.history || [])];
  
  // Push old text to history if it has changed and is not already the last history entry
  if (currentComment.text !== newText) {
    updatedHistory.push(currentComment.text);
  }
  
  if (!isConfigured) {
    // Local fallback
    appComments[entryId][commentIndex].text = newText;
    appComments[entryId][commentIndex].edited = true;
    appComments[entryId][commentIndex].history = updatedHistory;
    save(COMMENTS_KEY, appComments);
    renderComments(entryId, appComments);
  } else {
    // Supabase
    try {
      const { error } = await supabase
        .from('comments')
        .update({
          text: newText,
          edited: true,
          history: updatedHistory
        })
        .eq('id', commentId);
        
      if (error) {
        // Fallback for missing history/edited columns in database
        console.warn('Supabase comment update failed, trying fallback to text only...', error);
        const { error: textOnlyError } = await supabase
          .from('comments')
          .update({ text: newText })
          .eq('id', commentId);
        if (textOnlyError) throw textOnlyError;
      }
      
      appComments[entryId][commentIndex].text = newText;
      appComments[entryId][commentIndex].edited = true;
      appComments[entryId][commentIndex].history = updatedHistory;
      renderComments(entryId, appComments);
    } catch (err) {
      console.error('Error saving comment edit:', err);
      alert('Could not save comment. Check console.');
      return;
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    }
  }
  
  // Smoothly scroll back to the edited comment
  setTimeout(() => {
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (commentEl) {
      commentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
}

// ---- Thumbs Up/Down Voting Logic ----
async function toggleVote(entryId, voteType) {
  const postIndex = appPosts.findIndex(x => x.id === entryId);
  if (postIndex === -1) return;

  if (!isLoggedIn(currentSession)) {
    alert('Please log in or sign up to cast your vote.');
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.classList.add('open');
    return;
  }

  if (hasSubmittedComment(entryId)) {
    return; // Lock vote state completely if a comment has been submitted
  }

  const currentPost = appPosts[postIndex];
  const previousVote = getPostVote(entryId);

  let newAgrees = currentPost.agrees || 0;
  let newDisagrees = currentPost.disagrees || 0;
  let newVote = null;

  if (previousVote === voteType) {
    // Undo vote
    if (voteType === 'agree') newAgrees = Math.max(0, newAgrees - 1);
    if (voteType === 'disagree') newDisagrees = Math.max(0, newDisagrees - 1);
    newVote = null;
  } else {
    // Apply new vote, and undo previous if any
    if (previousVote === 'agree') newAgrees = Math.max(0, newAgrees - 1);
    if (previousVote === 'disagree') newDisagrees = Math.max(0, newDisagrees - 1);

    if (voteType === 'agree') {
      newAgrees++;
      const agreeBtn = document.querySelector(`.btn-agree[data-entry-id="${entryId}"]`);
      if (agreeBtn) {
        triggerAsmrEffect(agreeBtn, false);
      }
    }
    if (voteType === 'disagree') {
      newDisagrees++;
      const disagreeBtn = document.querySelector(`.btn-disagree[data-entry-id="${entryId}"]`);
      if (disagreeBtn) {
        triggerAsmrEffect(disagreeBtn, true);
      }
    }
    newVote = voteType;
  }

  if (!isConfigured) {
    // Local fallback
    appPosts[postIndex].agrees = newAgrees;
    appPosts[postIndex].disagrees = newDisagrees;
    save(POSTS_KEY, appPosts);
    updateVoteUI(entryId, newAgrees, newDisagrees, newVote);
  } else {
    // Supabase live database
    try {
      const { error } = await supabase
        .from('posts')
        .update({ 
          agrees: newAgrees,
          disagrees: newDisagrees
        })
        .eq('id', entryId);

      if (error) throw error;
      
      appPosts[postIndex].agrees = newAgrees;
      appPosts[postIndex].disagrees = newDisagrees;
      updateVoteUI(entryId, newAgrees, newDisagrees, newVote);
    } catch (err) {
      console.error('Error toggling vote on Supabase:', err);
      return;
    }
  }

  setPostVote(entryId, newVote);
}

function updateVoteUI(entryId, agrees, disagrees, activeVote) {
  const agreeBtn = document.querySelector(`.btn-agree[data-entry-id="${entryId}"]`);
  const disagreeBtn = document.querySelector(`.btn-disagree[data-entry-id="${entryId}"]`);
  const agreeCount = document.getElementById(`agreeCount-${entryId}`);
  const disagreeCount = document.getElementById(`disagreeCount-${entryId}`);
  const replySection = document.getElementById(`replySection-${entryId}`);

  if (agreeCount) agreeCount.textContent = agrees;
  if (disagreeCount) disagreeCount.textContent = disagrees;

  if (agreeBtn) {
    if (activeVote === 'agree') agreeBtn.classList.add('active');
    else agreeBtn.classList.remove('active');
  }

  if (disagreeBtn) {
    if (activeVote === 'disagree') disagreeBtn.classList.add('active');
    else disagreeBtn.classList.remove('active');
  }

  // Slide open/close the comment input box conditional on Thumbs Down
  if (replySection) {
    if (activeVote === 'disagree') {
      replySection.classList.add('open');
      setTimeout(() => {
        replySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } else {
      replySection.classList.remove('open');
      const ta = replySection.querySelector('.reply-text');
      if (ta) ta.value = '';
    }
  }
}

// ---- Save Post Edit ----
async function savePostEdit(entryId) {
  const qInput = document.getElementById(`editQuestion-${entryId}`);
  const pInput = document.getElementById(`editPerspective-${entryId}`);
  const q = (qInput.value || '').trim();
  const p = (pInput.value || '').trim();

  if (!q || !p) {
    alert('Both question and perspective are required.');
    return;
  }

  const postIndex = appPosts.findIndex(x => x.id === entryId);
  if (postIndex === -1) return;

  const currentPost = appPosts[postIndex];
  const newEditCount = (currentPost.edit_count || 0) + 1;

  if (!isConfigured) {
    // Local fallback
    appPosts[postIndex].question = q;
    appPosts[postIndex].perspective = p;
    appPosts[postIndex].edit_count = newEditCount;
    save(POSTS_KEY, appPosts);
  } else {
    // Supabase
    try {
      const saveBtn = document.querySelector(`.btn-edit-save[data-entry-id="${entryId}"]`);
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      
      const { error } = await supabase
        .from('posts')
        .update({
          question: q,
          perspective: p,
          edit_count: newEditCount
        })
        .eq('id', entryId);

      if (error) throw error;
      
      appPosts[postIndex].question = q;
      appPosts[postIndex].perspective = p;
      appPosts[postIndex].edit_count = newEditCount;
    } catch (err) {
      console.error('Error saving post edit to Supabase:', err);
      alert('Could not save edit. Check console.');
      return;
    }
  }

  // Re-render all elements
  renderAllEntries(appPosts);
  appPosts.forEach(post => renderComments(post.id, appComments));
  
  // Re-bind listeners and update Admin UI
  attachEventListeners();
  let session = null;
  if (isConfigured) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  }
  updateAuthUI(session);

  // Smoothly scroll edited card into view
  setTimeout(() => {
    const entryEl = document.getElementById(`entry-${entryId}`);
    if (entryEl) {
      entryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
}

// ---- Delete Post ----
async function deletePost(entryId) {
  if (!isConfigured) {
    // Local fallback
    appPosts = appPosts.filter(x => x.id !== entryId);
    save(POSTS_KEY, appPosts);
    delete appComments[entryId];
    save(COMMENTS_KEY, appComments);
  } else {
    // Supabase
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', entryId);

      if (error) throw error;

      appPosts = appPosts.filter(x => x.id !== entryId);
      delete appComments[entryId];
    } catch (err) {
      console.error('Error deleting post from Supabase:', err);
      alert('Could not delete post. Check console.');
      return;
    }
  }

  // Re-render all elements
  renderAllEntries(appPosts);
  appPosts.forEach(post => renderComments(post.id, appComments));
  
  // Re-bind listeners and update Admin UI
  attachEventListeners();
  let session = null;
  if (isConfigured) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  }
  updateAuthUI(session);
}

// ---- Auth Helpers ----
function isLoggedIn(session) {
  if (sessionStorage.getItem('perspecteave_auth_is_guest') === 'true') {
    return true;
  }
  if (isConfigured) {
    return !!session;
  }
  return sessionStorage.getItem('perspecteave_auth_session') === 'true';
}

// Check if admin is currently logged in
function isAdmin(session) {
  if (!isLoggedIn(session)) return false;
  const username = getCurrentUsername(session);
  return username && username.toLowerCase() === 'teaboy27';
}

// Update comment inputs to show username if logged in
function updateCommentForms(session) {
  const loggedIn = isLoggedIn(session);
  const username = getCurrentUsername(session);

  document.querySelectorAll('.reply-form').forEach(form => {
    const nameInput = form.querySelector('.reply-name');
    if (nameInput) {
      if (loggedIn) {
        nameInput.value = username;
        nameInput.style.display = 'none';
      } else {
        nameInput.value = '';
        nameInput.style.display = 'block';
        nameInput.placeholder = 'Your name';
      }
    }
  });

  const requestNameInput = document.getElementById('requestName');
  if (requestNameInput) {
    if (loggedIn) {
      requestNameInput.value = username;
      requestNameInput.style.display = 'none';
    } else {
      requestNameInput.value = '';
      requestNameInput.style.display = 'block';
      requestNameInput.placeholder = 'Your name';
    }
  }
}

async function updateAuthUI(session) {
  const loginBtn = document.getElementById('loginBtn');
  const profileWidget = document.getElementById('profileWidget');
  const profileDetailName = document.getElementById('profileDetailName');
  const profileDetailEmail = document.getElementById('profileDetailEmail');
  const panel = document.getElementById('adminPanel');
  const newPostBtn = document.getElementById('newPostBtn');

  if (isConfigured && session === undefined) {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  }

  currentSession = session;
  const loggedIn = isLoggedIn(session);
  const adminLoggedIn = isAdmin(session);

  // Render entries and comments dynamically based on auth/verification state
  renderAllEntries(appPosts);
  if (appPosts.length > 0) {
    appPosts.forEach(post => renderComments(post.id, appComments));
  }

  // Refresh event listeners since entries list was re-rendered
  attachEventListeners();

  updateCommentForms(session);

  // Toggle Edit/Delete options for individual entries
  const entryActions = document.querySelectorAll('.entry-admin-actions');
  entryActions.forEach(el => {
    el.style.display = adminLoggedIn ? 'flex' : 'none';
  });

  if (loggedIn) {
    loginBtn.style.display = 'none';
    if (profileWidget) profileWidget.style.display = 'block';
    
    // Populate profile details
    let username = 'Anonymous';
    let email = '';
    if (isConfigured) {
      username = session?.user?.user_metadata?.username || session?.user?.email || 'Anonymous';
      email = session?.user?.email || '';
    } else {
      username = sessionStorage.getItem('perspecteave_auth_username') || 'Anonymous';
      email = sessionStorage.getItem('perspecteave_auth_email') || '';
    }
    
    if (profileDetailName) profileDetailName.textContent = username;
    if (profileDetailEmail) profileDetailEmail.textContent = email;

    const profileAvatarInitial = document.getElementById('profileAvatarInitial');
    if (profileAvatarInitial && username) {
      profileAvatarInitial.textContent = username.trim().charAt(0).toUpperCase();
    }

    const profileVerifyContainer = document.getElementById('profileVerifyContainer');
    if (profileVerifyContainer) {
      profileVerifyContainer.innerHTML = '';
    }

    // Handle guest timer lock
    setupGuestTimer();
    
    // Hide New Post button if signed-in user is not the admin
    const askAuthorWrapper = document.getElementById('askAuthorWrapper');
    if (adminLoggedIn) {
      newPostBtn.style.display = 'flex';
      if (askAuthorWrapper) askAuthorWrapper.style.display = 'none';
      const adminRequestsBox = document.getElementById('adminRequestsBox');
      if (adminRequestsBox) adminRequestsBox.style.display = 'block';
      const requestDropdown = document.getElementById('requestDropdown');
      if (requestDropdown) {
        requestDropdown.classList.remove('open');
      }
      const askAuthorBtn = document.getElementById('askAuthorBtn');
      if (askAuthorBtn) askAuthorBtn.classList.remove('active');
      renderAdminRequests();
    } else {
      newPostBtn.style.display = 'none';
      if (askAuthorWrapper) askAuthorWrapper.style.display = 'block';
      const adminRequestsBox = document.getElementById('adminRequestsBox');
      if (adminRequestsBox) adminRequestsBox.style.display = 'none';
    }
  } else {
    loginBtn.style.display = 'flex';
    if (profileWidget) profileWidget.style.display = 'none';
    newPostBtn.style.display = 'none';
    panel.classList.remove('open');
    
    const askAuthorWrapper = document.getElementById('askAuthorWrapper');
    if (askAuthorWrapper) askAuthorWrapper.style.display = 'block';
    const adminRequestsBox = document.getElementById('adminRequestsBox');
    if (adminRequestsBox) adminRequestsBox.style.display = 'none';
  }
}

// ---- Setup Auth Events ----
function setupAuth() {
  const loginBtn = document.getElementById('loginBtn');
  const loginOverlay = document.getElementById('loginOverlay');
  const loginCloseBtn = document.getElementById('loginCloseBtn');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const profileTrigger = document.getElementById('profileTrigger');
  const profileDropdown = document.getElementById('profileDropdown');
  const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  const newPostBtn = document.getElementById('newPostBtn');
  const panel = document.getElementById('adminPanel');
  const postBtn = document.getElementById('adminPostBtn');
  const cancelBtn = document.getElementById('adminCancelBtn');
  const qInput = document.getElementById('adminQuestion');
  const pInput = document.getElementById('adminPerspective');
  const modalToggleLink = document.getElementById('modalToggleLink');
  const modalTitle = document.getElementById('modalTitle');
  const modalSubtitle = document.getElementById('modalSubtitle');

  let authMode = 'signin'; // 'signin' or 'signup'

  function setAuthMode(mode) {
    authMode = mode;
    loginError.style.display = 'none';

    if (authMode === 'signup') {
      modalTitle.textContent = 'Create account';
      modalSubtitle.textContent = 'Choose a unique username and password.';
      loginUsername.style.display = 'block';
      loginUsername.placeholder = 'Enter username';
      loginUsername.required = true;
      
      loginPassword.style.display = 'block';
      loginPassword.required = true;
      
      loginSubmitBtn.textContent = 'Sign up';
      modalToggleLink.textContent = 'Already have an account? Sign in';
      setTimeout(() => loginUsername.focus(), 100);
    } else {
      // signin
      modalTitle.textContent = 'Welcome back';
      modalSubtitle.textContent = 'Sign in with your username and password.';
      loginUsername.style.display = 'block';
      loginUsername.placeholder = 'Enter username';
      loginUsername.required = true;
      
      loginPassword.style.display = 'block';
      loginPassword.required = true;
      
      loginSubmitBtn.textContent = 'Sign in';
      modalToggleLink.textContent = "Don't have an account? Sign up";
      setTimeout(() => loginUsername.focus(), 100);
    }
  }

  // Toggle standard Sign In / Sign Up
  modalToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (authMode === 'signin') {
      setAuthMode('signup');
    } else {
      setAuthMode('signin');
    }
  });

  // Show login modal
  loginBtn.addEventListener('click', () => {
    loginOverlay.classList.add('open');
    setAuthMode('signin');
    
    loginUsername.value = '';
    loginPassword.value = '';
    loginError.style.display = 'none';
    setTimeout(() => loginUsername.focus(), 300);
  });

  // Close login modal
  loginCloseBtn.addEventListener('click', () => {
    loginOverlay.classList.remove('open');
  });

  loginOverlay.addEventListener('click', (e) => {
    if (e.target === loginOverlay) loginOverlay.classList.remove('open');
  });

  // Expose function globally so guest timer can trigger it
  globalOpenAuthModal = function(mode) {
    loginOverlay.classList.add('open');
    setAuthMode(mode);
    loginUsername.value = '';
    loginPassword.value = '';
    loginError.style.display = 'none';
  };

  // Attempt Login / Sign Up
  async function attemptAuth() {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username || !password) {
      loginError.textContent = 'Please enter both username and password';
      loginError.style.display = 'block';
      return;
    }

    const email = username.toLowerCase() + '@perspecteave.local';

    if (!isConfigured) {
      // Local mockup auth fallback
      const mockUsers = JSON.parse(localStorage.getItem('perspecteave_mock_users') || '[]');
      if (authMode === 'signin') {
        const found = mockUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        
        if (username.toLowerCase() === 'teaboy27' && password === 'perspecteave') {
          sessionStorage.setItem('perspecteave_auth_session', 'true');
          sessionStorage.setItem('perspecteave_auth_username', 'teaboy27');
          sessionStorage.setItem('perspecteave_auth_email', 'teaboy27@perspecteave.local');
          sessionStorage.setItem('perspecteave_auth_verified', 'true');
          loginOverlay.classList.remove('open');
          
          const timeLockOverlay = document.getElementById('timeLockOverlay');
          if (timeLockOverlay) timeLockOverlay.classList.remove('open');
          document.body.style.overflow = '';
          updateAuthUI();
          localStorage.removeItem('perspecteave_first_visit');
        } else if (found) {
          sessionStorage.setItem('perspecteave_auth_session', 'true');
          sessionStorage.setItem('perspecteave_auth_username', found.username);
          sessionStorage.setItem('perspecteave_auth_email', found.email);
          sessionStorage.setItem('perspecteave_auth_verified', 'true');
          loginOverlay.classList.remove('open');
          
          const timeLockOverlay = document.getElementById('timeLockOverlay');
          if (timeLockOverlay) timeLockOverlay.classList.remove('open');
          document.body.style.overflow = '';
          updateAuthUI();
          localStorage.removeItem('perspecteave_first_visit');
        } else {
          loginError.textContent = 'Incorrect username or password';
          loginError.style.display = 'block';
          loginPassword.style.borderColor = 'var(--cat-flaw)';
          setTimeout(() => { loginPassword.style.borderColor = ''; }, 2000);
        }
      } else {
        // Mockup Signup
        if (mockUsers.some(u => u.username.toLowerCase() === username.toLowerCase()) || username.toLowerCase() === 'teaboy27') {
          loginError.textContent = 'This username is already taken. Please try another one.';
          loginError.style.display = 'block';
          return;
        }

        const newUser = {
          username,
          email,
          password,
          verified: true
        };
        mockUsers.push(newUser);
        localStorage.setItem('perspecteave_mock_users', JSON.stringify(mockUsers));

        sessionStorage.setItem('perspecteave_auth_session', 'true');
        sessionStorage.setItem('perspecteave_auth_username', username);
        sessionStorage.setItem('perspecteave_auth_email', email);
        sessionStorage.setItem('perspecteave_auth_verified', 'true');
        loginOverlay.classList.remove('open');
        
        const timeLockOverlay = document.getElementById('timeLockOverlay');
        if (timeLockOverlay) timeLockOverlay.classList.remove('open');
        document.body.style.overflow = '';
        updateAuthUI();
        localStorage.removeItem('perspecteave_first_visit');
      }
    } else {
      // Real Supabase Auth
      try {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = authMode === 'signin' ? 'Signing in...' : 'Signing up...';
        
        if (authMode === 'signin') {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (error) throw error;
          
          currentSession = data.session;
          loginOverlay.classList.remove('open');
          
          const timeLockOverlay = document.getElementById('timeLockOverlay');
          if (timeLockOverlay) timeLockOverlay.classList.remove('open');
          document.body.style.overflow = '';
          updateAuthUI(data.session);
          localStorage.removeItem('perspecteave_first_visit');
        } else {
          // Sign Up
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                username: username,
                verified: true
              }
            }
          });
          if (error) throw error;
          
          if (!data.session) {
            throw new Error('This username is already taken. Please try another one.');
          }

          currentSession = data.session;
          loginOverlay.classList.remove('open');
          
          const timeLockOverlay = document.getElementById('timeLockOverlay');
          if (timeLockOverlay) timeLockOverlay.classList.remove('open');
          document.body.style.overflow = '';
          updateAuthUI(data.session);
          localStorage.removeItem('perspecteave_first_visit');
        }
      } catch (err) {
        console.error('Auth error:', err);
        loginError.textContent = err.message || 'Incorrect username or password';
        loginError.style.display = 'block';
        loginPassword.style.borderColor = 'var(--cat-flaw)';
        setTimeout(() => { loginPassword.style.borderColor = ''; }, 2000);
      } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = authMode === 'signin' ? 'Sign in' : 'Sign up';
      }
    }
  }

  loginSubmitBtn.addEventListener('click', attemptAuth);
  
  [loginUsername, loginPassword].forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); attemptAuth(); }
      });
    }
  });

  // Time limit lock overlay button handlers
  const timeLockSignupBtn = document.getElementById('timeLockSignupBtn');
  const timeLockLoginBtn = document.getElementById('timeLockLoginBtn');
  if (timeLockSignupBtn) {
    timeLockSignupBtn.addEventListener('click', () => {
      if (globalOpenAuthModal) globalOpenAuthModal('signup');
    });
  }
  if (timeLockLoginBtn) {
    timeLockLoginBtn.addEventListener('click', () => {
      if (globalOpenAuthModal) globalOpenAuthModal('signin');
    });
  }

  // Profile dropdown toggling
  if (profileTrigger && profileDropdown) {
    profileTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('open');
      profileTrigger.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!profileTrigger.contains(e.target) && !profileDropdown.contains(e.target)) {
        profileDropdown.classList.remove('open');
        profileTrigger.classList.remove('active');
      }
    });

    // Profile verify email button handler (via event delegation)
    profileDropdown.addEventListener('click', async (e) => {
      if (e.target.classList.contains('btn-verify-dropdown')) {
        let email = '';
        if (isConfigured && currentSession?.user) {
          email = currentSession.user.email;
        } else {
          email = sessionStorage.getItem('perspecteave_auth_email');
        }

        if (email) {
          // Close the profile dropdown
          profileDropdown.classList.remove('open');
          profileTrigger.classList.remove('active');
          
          showVerifyOverlay(email);
        } else {
          console.error('Could not find email to verify.');
        }
      }
    });
  }

  // Logout
  dropdownLogoutBtn.addEventListener('click', async () => {
    if (profileDropdown) profileDropdown.classList.remove('open');
    if (profileTrigger) profileTrigger.classList.remove('active');
    
    const wasGuest = sessionStorage.getItem('perspecteave_auth_is_guest') === 'true';
    
    sessionStorage.removeItem('perspecteave_auth_session');
    sessionStorage.removeItem('perspecteave_auth_username');
    sessionStorage.removeItem('perspecteave_auth_email');
    sessionStorage.removeItem('perspecteave_auth_verified');
    sessionStorage.removeItem('perspecteave_auth_is_guest');
    
    panel.classList.remove('open');
    
    if (isConfigured && !wasGuest) {
      await supabase.auth.signOut();
    } else {
      updateAuthUI();
    }
  });

  // New Post button
  newPostBtn.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      qInput.focus();
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Cancel post
  cancelBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    qInput.value = '';
    pInput.value = '';
  });

  // Publish post
  postBtn.addEventListener('click', async () => {
    const q = (qInput.value || '').trim();
    const p = (pInput.value || '').trim();
    if (!q || !p) {
      if (!q) { qInput.style.borderColor = 'var(--accent-tea)'; setTimeout(() => qInput.style.borderColor = '', 1500); }
      if (!p) { pInput.style.borderColor = 'var(--accent-tea)'; setTimeout(() => pInput.style.borderColor = '', 1500); }
      return;
    }

    if (!isConfigured) {
      const newId = appPosts.length > 0 ? Math.max(...appPosts.map(x => x.id)) + 1 : 1;
      appPosts.push({ id: newId, question: q, perspective: p, edit_count: 0, agrees: 0, disagrees: 0 });
      save(POSTS_KEY, appPosts);
    } else {
      try {
        postBtn.disabled = true;
        const { data, error } = await supabase
          .from('posts')
          .insert({ question: q, perspective: p, edit_count: 0, agrees: 0, disagrees: 0 })
          .select('*')
          .single();

        if (error) throw error;
        appPosts.push(data);
      } catch (err) {
        console.error('Error saving post to Supabase:', err);
        alert('Could not save post. Check console.');
        return;
      } finally {
        postBtn.disabled = false;
      }
    }

    // Initialize comments structure for the new post
    if (!appComments[appPosts[appPosts.length - 1].id]) {
      appComments[appPosts[appPosts.length - 1].id] = [];
    }

    renderAllEntries(appPosts);
    appPosts.forEach(post => renderComments(post.id, appComments));
    attachEventListeners();

    qInput.value = '';
    pInput.value = '';
    panel.classList.remove('open');

    // Smoothly scroll to the new post
    setTimeout(() => {
      const newId = appPosts[appPosts.length - 1].id;
      const entryEl = document.getElementById(`entry-${newId}`);
      if (entryEl) {
        entryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
  });

  // Listen to Supabase auth state changes
  if (isConfigured) {
    supabase.auth.onAuthStateChange((event, session) => {
      updateAuthUI(session);
    });
  } else {
    updateAuthUI();
  }
}

// ---- Attach Dynamic DOM Event Listeners ----
function attachEventListeners() {
  // Entry expand/collapse (Accordion)
  document.querySelectorAll('.entry-summary').forEach(summary => {
    summary.addEventListener('click', () => {
      const entry = summary.closest('.entry');
      // Ignore click if editing inside the form
      const editForm = entry.querySelector('.entry-edit-form');
      const isEditing = editForm && editForm.style.display === 'flex';
      if (isEditing) return;

      const wasExpanded = entry.classList.contains('expanded');
      document.querySelectorAll('.entry').forEach(el => el.classList.remove('expanded'));
      if (!wasExpanded) {
        entry.classList.add('expanded');
        setTimeout(() => entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
      }
    });
  });

  // Prevent clicks in edit forms, reply forms, comments, action rows from toggling accordion
  document.querySelectorAll('.reply-form, .comments-section, .entry-edit-form, .entry-actions-row').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-comment-edit') || 
          e.target.classList.contains('btn-comment-save') || 
          e.target.classList.contains('btn-comment-cancel') || 
          e.target.closest('.comment-history-nav')) {
        return; // Allow propagation for comment action buttons and history nav
      }
      e.stopPropagation();
    });
  });

  // Reply submit buttons (Circular checkmark)
  document.querySelectorAll('.btn-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitReply(Number(btn.dataset.entryId));
    });
  });

  // Enter to submit in textareas
  document.querySelectorAll('.reply-text').forEach(ta => {
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitReply(Number(ta.closest('.reply-form').dataset.entryId));
      }
    });
  });

  // View comments toggle button
  document.querySelectorAll('.btn-view-comments').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const body = document.getElementById(`commentsBody-${entryId}`);
      const wasOpen = body.classList.contains('open');
      
      body.classList.toggle('open');
      btn.classList.toggle('open');
      
      if (!wasOpen) {
        setTimeout(() => {
          body.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 350);
      }
    });
  });

  // Vote buttons click handlers
  document.querySelectorAll('.btn-agree').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      toggleVote(entryId, 'agree');
    });
  });

  document.querySelectorAll('.btn-disagree').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      toggleVote(entryId, 'disagree');
    });
  });

  // --- Admin Post Actions Event Handlers ---
  document.querySelectorAll('.btn-entry-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      document.getElementById(`entryStatic-${entryId}`).style.display = 'none';
      document.getElementById(`entryEdit-${entryId}`).style.display = 'flex';
    });
  });

  document.querySelectorAll('.btn-edit-cancel').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      document.getElementById(`entryStatic-${entryId}`).style.display = 'block';
      document.getElementById(`entryEdit-${entryId}`).style.display = 'none';
    });
  });

  document.querySelectorAll('.btn-edit-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      await savePostEdit(entryId);
    });
  });

  document.querySelectorAll('.btn-entry-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      if (confirm('Are you sure you want to delete this perspective? This will also delete all comments.')) {
        await deletePost(entryId);
      }
    });
  });

  // Event delegation for comment actions (Edit, Cancel, Save, History Toggles) and guest limits
  const entriesList = document.getElementById('entriesList');
  if (entriesList && !entriesList.dataset.listenersAttached) {
    entriesList.dataset.listenersAttached = 'true';
    entriesList.addEventListener('click', async (e) => {
      // 0. Guest login CTA clicks
      if (e.target.classList.contains('btn-comment-login-trigger')) {
        e.preventDefault();
        e.stopPropagation();
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) loginOverlay.classList.add('open');
        return;
      }

      // 1. Comment Edit button clicked
      if (e.target.classList.contains('btn-comment-edit')) {
        e.stopPropagation();
        const commentId = Number(e.target.dataset.commentId);
        const staticEl = document.getElementById(`commentStatic-${commentId}`);
        const editForm = document.getElementById(`commentEdit-${commentId}`);
        const textarea = document.getElementById(`commentEditTextarea-${commentId}`);
        
        if (staticEl && editForm) {
          staticEl.style.display = 'none';
          editForm.style.display = 'block';
          if (textarea) {
            textarea.value = textarea.textContent || textarea.value; // ensure text is in textarea
            textarea.focus();
          }
        }
      }
      
      // 2. Comment Cancel button clicked
      if (e.target.classList.contains('btn-comment-cancel')) {
        e.stopPropagation();
        const commentId = Number(e.target.dataset.commentId);
        const staticEl = document.getElementById(`commentStatic-${commentId}`);
        const editForm = document.getElementById(`commentEdit-${commentId}`);
        
        if (staticEl && editForm) {
          staticEl.style.display = 'block';
          editForm.style.display = 'none';
        }
      }
      
      // 3. Comment Save button clicked
      if (e.target.classList.contains('btn-comment-save')) {
        e.stopPropagation();
        const commentId = Number(e.target.dataset.commentId);
        await saveCommentEdit(commentId);
      }
      
      // 4. Comment Undo (Show previous version) clicked
      if (e.target.closest('.btn-comment-undo')) {
        e.stopPropagation();
        const btn = e.target.closest('.btn-comment-undo');
        const commentId = Number(btn.dataset.commentId);
        
        let comment = null;
        for (const postId in appComments) {
          const c = appComments[postId].find(x => x.id === commentId);
          if (c) { comment = c; break; }
        }
        if (!comment || !comment.history || comment.history.length === 0) return;

        const nav = btn.closest('.comment-history-nav');
        if (!nav) return;

        let currentIndex = Number(nav.dataset.currentIndex);
        const totalVersions = Number(nav.dataset.totalVersions);

        if (currentIndex > 0) {
          currentIndex--;
          nav.dataset.currentIndex = currentIndex;

          // Update text displayed
          const commentTextEl = document.querySelector(`#comment-${commentId} .comment-card-text`);
          const versions = [...comment.history, comment.text];
          if (commentTextEl) {
            commentTextEl.textContent = versions[currentIndex];
          }

          // Update indicator
          const indicator = document.getElementById(`versionIndicator-${commentId}`);
          if (indicator) {
            indicator.textContent = `v${currentIndex + 1}/${totalVersions}`;
          }

          // Enable/disable buttons
          const undoBtn = nav.querySelector('.btn-comment-undo');
          const redoBtn = nav.querySelector('.btn-comment-redo');
          if (undoBtn) undoBtn.disabled = (currentIndex === 0);
          if (redoBtn) redoBtn.disabled = (currentIndex === totalVersions - 1);
        }
      }

      // 5. Comment Redo (Show next version) clicked
      if (e.target.closest('.btn-comment-redo')) {
        e.stopPropagation();
        const btn = e.target.closest('.btn-comment-redo');
        const commentId = Number(btn.dataset.commentId);
        
        let comment = null;
        for (const postId in appComments) {
          const c = appComments[postId].find(x => x.id === commentId);
          if (c) { comment = c; break; }
        }
        if (!comment || !comment.history || comment.history.length === 0) return;

        const nav = btn.closest('.comment-history-nav');
        if (!nav) return;

        let currentIndex = Number(nav.dataset.currentIndex);
        const totalVersions = Number(nav.dataset.totalVersions);

        if (currentIndex < totalVersions - 1) {
          currentIndex++;
          nav.dataset.currentIndex = currentIndex;

          // Update text displayed
          const commentTextEl = document.querySelector(`#comment-${commentId} .comment-card-text`);
          const versions = [...comment.history, comment.text];
          if (commentTextEl) {
            commentTextEl.textContent = versions[currentIndex];
          }

          // Update indicator
          const indicator = document.getElementById(`versionIndicator-${commentId}`);
          if (indicator) {
            indicator.textContent = `v${currentIndex + 1}/${totalVersions}`;
          }

          // Enable/disable buttons
          const undoBtn = nav.querySelector('.btn-comment-undo');
          const redoBtn = nav.querySelector('.btn-comment-redo');
          if (undoBtn) undoBtn.disabled = (currentIndex === 0);
          if (redoBtn) redoBtn.disabled = (currentIndex === totalVersions - 1);
        }
      }
    });
  }
}


// ---- Topic Requests logic ----
let appRequests = [];
const REQUESTS_KEY = 'perspecteave_topic_requests';

async function loadTopicRequests() {
  if (isConfigured) {
    try {
      const { data, error } = await supabase
        .from('topic_requests')
        .select('*')
        .order('id', { ascending: false });
      if (!error && data) {
        appRequests = data;
        return;
      }
    } catch (err) {
      console.warn('Could not load from topic_requests table, using local storage fallback:', err);
    }
  }
  appRequests = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
}

async function submitTopicRequest() {
  const nameInput = document.getElementById('requestName');
  const questionInput = document.getElementById('requestQuestionText');
  const btn = document.getElementById('requestSubmitBtn');
  
  const question = (questionInput.value || '').trim();
  if (!question) {
    questionInput.style.borderColor = 'var(--accent-tea)';
    questionInput.focus();
    setTimeout(() => { questionInput.style.borderColor = ''; }, 1500);
    return;
  }
  
  let name = '';
  const loggedIn = isLoggedIn(currentSession);
  if (loggedIn) {
    name = getCurrentUsername(currentSession);
  } else {
    name = (nameInput.value || '').trim();
    if (!name) {
      nameInput.style.borderColor = 'var(--accent-tea)';
      nameInput.focus();
      setTimeout(() => { nameInput.style.borderColor = ''; }, 1500);
      alert('Please enter your name to submit a request.');
      return;
    }
  }
  
  btn.disabled = true;
  
  if (isConfigured) {
    try {
      const { error } = await supabase
        .from('topic_requests')
        .insert({ name, question });
      if (!error) {
        questionInput.value = '';
        if (!loggedIn) nameInput.value = '';
        
        const origHTML = btn.innerHTML;
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        btn.style.backgroundColor = 'var(--accent-matcha)';
        btn.style.color = '#FFFFFF';
        
        setTimeout(() => {
          btn.innerHTML = origHTML;
          btn.style.backgroundColor = '';
          btn.style.color = '';
          btn.disabled = false;
          const requestDropdown = document.getElementById('requestDropdown');
          if (requestDropdown) requestDropdown.classList.remove('open');
          const askAuthorBtn = document.getElementById('askAuthorBtn');
          if (askAuthorBtn) askAuthorBtn.classList.remove('active');
        }, 1800);
        
        alert('Thank you! Your request has been submitted to Adithyan.');
        await loadTopicRequests();
        renderAdminRequests();
        return;
      }
    } catch (err) {
      console.warn('Could not insert to Supabase topic_requests, using local storage fallback:', err);
    }
  }
  
  const newRequest = {
    id: Date.now(),
    name,
    question,
    created_at: new Date().toISOString()
  };
  
  appRequests.unshift(newRequest);
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(appRequests));
  
  questionInput.value = '';
  if (!loggedIn) nameInput.value = '';
  
  const origHTML = btn.innerHTML;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
  btn.style.backgroundColor = 'var(--accent-matcha)';
  btn.style.color = '#FFFFFF';
  
  setTimeout(() => {
    btn.innerHTML = origHTML;
    btn.style.backgroundColor = '';
    btn.style.color = '';
    btn.disabled = false;
    const requestDropdown = document.getElementById('requestDropdown');
    if (requestDropdown) requestDropdown.classList.remove('open');
    const askAuthorBtn = document.getElementById('askAuthorBtn');
    if (askAuthorBtn) askAuthorBtn.classList.remove('active');
  }, 1800);
  
  alert('Thank you! Your request has been submitted to Adithyan.');
  renderAdminRequests();
}

async function dismissRequest(requestId) {
  if (isConfigured) {
    try {
      const { error } = await supabase
        .from('topic_requests')
        .delete()
        .eq('id', requestId);
      if (!error) {
        await loadTopicRequests();
        renderAdminRequests();
        return;
      }
    } catch (err) {
      console.warn('Could not delete from Supabase topic_requests:', err);
    }
  }
  
  appRequests = appRequests.filter(r => r.id !== requestId);
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(appRequests));
  renderAdminRequests();
}

function startTakeFromRequest(question) {
  const adminQuestionInput = document.getElementById('adminQuestion');
  if (adminQuestionInput) {
    adminQuestionInput.value = question;
    adminQuestionInput.focus();
    
    // Open admin panel if closed
    const panel = document.getElementById('adminPanel');
    if (panel && !panel.classList.contains('open')) {
      panel.classList.add('open');
    }
    
    adminQuestionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function renderAdminRequests() {
  const listEl = document.getElementById('adminRequestsList');
  if (!listEl) return;
  
  if (appRequests.length === 0) {
    listEl.innerHTML = '<li style="font-family: var(--font-body); font-size: 0.88rem; color: var(--text-muted); list-style:none;">No requests yet.</li>';
    return;
  }
  
  listEl.innerHTML = appRequests.map(req => {
    const timeStr = req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Just now';
    return `
      <li class="admin-request-item">
        <div class="admin-request-content">
          <div class="admin-request-text">${escapeHTML(req.question)}</div>
          <div class="admin-request-meta">Requested by: <strong>${escapeHTML(req.name || 'Anonymous')}</strong> • ${timeStr}</div>
        </div>
        <div class="admin-request-actions">
          <button type="button" class="btn-request-action btn-request-write" data-question="${escapeHTML(req.question)}">Write Take</button>
          <button type="button" class="btn-request-action btn-request-dismiss" data-request-id="${req.id}">Dismiss</button>
        </div>
      </li>
    `;
  }).join('');
  
  listEl.querySelectorAll('.btn-request-write').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const q = e.target.dataset.question;
      startTakeFromRequest(q);
    });
  });
  
  listEl.querySelectorAll('.btn-request-dismiss').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const reqId = Number(e.target.dataset.requestId);
      if (confirm('Are you sure you want to dismiss this request?')) {
        await dismissRequest(reqId);
      }
    });
  });
}

function setupRequestForm() {
  const askAuthorBtn = document.getElementById('askAuthorBtn');
  const requestDropdown = document.getElementById('requestDropdown');
  
  if (askAuthorBtn && requestDropdown) {
    askAuthorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      requestDropdown.classList.toggle('open');
      askAuthorBtn.classList.toggle('active');
    });

    // Close request dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!askAuthorBtn.contains(e.target) && !requestDropdown.contains(e.target)) {
        requestDropdown.classList.remove('open');
        askAuthorBtn.classList.remove('active');
      }
    });
  }

  const submitBtn = document.getElementById('requestSubmitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      submitTopicRequest();
    });
  }

  const questionTextarea = document.getElementById('requestQuestionText');
  if (questionTextarea) {
    questionTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitTopicRequest();
      }
    });
  }
}

// ---- Initialization ----
async function init() {
  // Load posts
  appPosts = await fetchPosts();

  // Load comments
  appComments = await fetchComments();

  // Load topic requests
  await loadTopicRequests();

  // Initialize session if configured
  if (isConfigured) {
    const { data } = await supabase.auth.getSession();
    currentSession = data.session;
    
    // Check if they just redirected from an email confirmation link
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('type=signup') || hash.includes('type=magiclink'))) {
      if (currentSession?.user && currentSession.user.user_metadata?.verified !== true) {
        try {
          const { error } = await supabase.auth.updateUser({
            data: { verified: true }
          });
          if (!error) {
            console.log('User auto-verified via email confirmation link.');
            currentSession.user.user_metadata.verified = true;
          }
        } catch (e) {
          console.error('Failed to auto-verify user on redirect:', e);
        }
      }
    }
  }

  setupAuth();
  setupRequestForm();

  // Trigger initial UI render based on current auth state
  await updateAuthUI(currentSession);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
