/* ============================================
   PerspecTEAve — Application Logic (Supabase Enabled)
   ============================================ */

import { supabase, isConfigured } from './supabaseClient.js';

// Register Service Worker for PWA installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.warn('Service Worker registration failed:', err));
  });
}

// ---- PWA Install Prompt Handler ----
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI to notify the user they can install the PWA
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'flex';
  }
});

window.addEventListener('appinstalled', () => {
  // Hide the install-button
  const installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
  // Clear the deferredPrompt
  deferredPrompt = null;
  console.log('PWA was installed');
});

// ---- Default posts (seed data) ----
const DEFAULT_POSTS = [
  {
    id: 1,
    question: 'Should political borders define our cultural identity?',
    perspective: 'Geography naturally shapes how we live — the food we eat, the languages we speak, the stories we tell. But enforcing strict cultural identities based purely on modern political borders often ignores the shared history of neighboring regions. The Basque culture straddles France and Spain. Bengali identity flows across India and Bangladesh. True culture is fluid and bleeds across lines drawn on a map by politicians, generals, and colonial cartographers. Maybe identity should be a river, not a fence.',
    edit_count: 0,
    agrees: 12,
    disagrees: 2,
    categories: ['Scholarly']
  },
  {
    id: 2,
    question: 'Does absolute connectivity alienate us from our immediate reality?',
    perspective: 'We can video-call someone across the planet in real time, yet we don\'t know our neighbor\'s name. Social media promised to bring us closer but created curated highlight reels instead of genuine connection. The paradox is sharp: we are more "connected" than any generation before us and simultaneously lonelier. Perhaps the issue isn\'t the tool but the illusion — the belief that watching someone\'s life is the same as being part of it.',
    edit_count: 0,
    agrees: 8,
    disagrees: 4,
    categories: ['Cosmic']
  },
  {
    id: 3,
    question: 'If ethical progress is inevitable, why do moral values cycle over generations?',
    perspective: 'Every generation believes it\'s more morally evolved than the last. Yet history suggests moral stances oscillate rather than march in a straight line. The liberalism of the Roaring Twenties gave way to the conservatism of the 1950s. Empires that championed pluralism eventually collapsed into xenophobia. Perhaps "progress" isn\'t a destination but a pendulum — and the real question is whether we can learn to keep the pendulum from swinging too far in either direction.',
    edit_count: 0,
    agrees: 15,
    disagrees: 3,
    categories: ['Cosmic']
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
const VIEWS_KEY = 'perspecteave_post_views_v3';

// ---- App State Variables ----
let appPosts = [];
let appComments = {};
let appPostViews = {};
// Categories / Themes data
const AVAILABLE_THEMES = [
  { value: 'Scholarly', label: 'Scholarly (Politics, History, Geopolitics)' },
  { value: 'Cosmic', label: 'Cosmic (Philosophy, 3am thoughts)' },
  { value: 'Science', label: 'Science (Science & Tech)' },
  { value: 'Warm', label: 'Warm (Social, People, Places)' }
];
let currentSession = null;
let lastRenderedState = {
  loggedIn: null,
  adminLoggedIn: null,
  username: null,
  email: null,
  initialized: false
};
let guestTimerTimeout = null;
let globalOpenAuthModal = null;
let currentGuestNumber = null;


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
          history: [],
          hidden: false
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
          if (updated.hidden === undefined) {
            updated.hidden = false;
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
        hidden: item.hidden || false,
        time: formatTime(item.created_at)
      });
    });

    return commentsMap;
  } catch (err) {
    console.error('Error fetching comments from Supabase:', err);
    return load(COMMENTS_KEY) || SEED_COMMENTS;
  }
}

async function fetchPostViews() {
  if (!isConfigured) {
    let localViews = load(VIEWS_KEY);
    if (!localViews) {
      localViews = {};
      // Backfill local default posts
      DEFAULT_POSTS.forEach(post => {
        const numericId = Number(post.id);
        const simulatedCount = ((post.agrees + post.disagrees) * 4) + 25;
        localViews[numericId] = [];
        for (let i = 1; i <= simulatedCount; i++) {
          localViews[numericId].push(`vis_seed_local_${numericId}_${i}`);
        }
      });
      save(VIEWS_KEY, localViews);
    }
    // Map to count map
    const viewsMap = {};
    for (const pid in localViews) {
      viewsMap[pid] = localViews[pid].length;
    }
    return viewsMap;
  }
  try {
    const { data, error } = await supabase
      .from('post_views')
      .select('post_id');

    if (error) throw error;

    const viewsMap = {};
    if (data) {
      data.forEach(item => {
        const pid = item.post_id;
        viewsMap[pid] = (viewsMap[pid] || 0) + 1;
      });
    }
    return viewsMap;
  } catch (err) {
    console.error('Error fetching post views from Supabase:', err);
    return load(VIEWS_KEY) || {};
  }
}

// ---- HTML Helpers ----
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Check if the perspective text represents "Coming soon"
function isComingSoonText(text) {
  if (!text) return false;
  return text.trim().toLowerCase().startsWith('coming soon');
}

// Lightweight client-side Markdown parser for bold, italic, underline, and bullet lists
function parsePerspectiveMarkdown(text) {
  if (!text) return '';
  
  // 1. Escape everything to prevent XSS
  let html = escapeHTML(text);

  // 2. Parse markdown bold: **text**
  html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');
  
  // 3. Parse markdown italic: *text* (avoiding inner strong asterisk)
  html = html.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');
  
  // 4. Parse markdown underline: __text__
  html = html.replace(/__([\s\S]*?)__/g, '<u>$1</u>');

  // 5. Parse bullet points
  const lines = html.split('\n');
  let inList = false;
  const resultLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)(?:-|\*)\s+(.*)$/);
    if (match) {
      if (!inList) {
        resultLines.push('<ul>');
        inList = true;
      }
      resultLines.push(`<li>${match[2]}</li>`);
    } else {
      if (inList) {
        resultLines.push('</ul>');
        inList = false;
      }
      resultLines.push(line);
    }
  }
  if (inList) {
    resultLines.push('</ul>');
  }

  return resultLines.join('\n');
}

// Insert formatting tags around selection in a textarea
function applyFormatting(textareaEl, type) {
  if (!textareaEl) return;
  const start = textareaEl.selectionStart;
  const end = textareaEl.selectionEnd;
  const text = textareaEl.value;
  const selected = text.substring(start, end);
  
  let formatted = '';
  let cursorOffset = 0;
  
  switch (type) {
    case 'bold':
      formatted = `**${selected || 'bold text'}**`;
      cursorOffset = 2;
      break;
    case 'italic':
      formatted = `*${selected || 'italic text'}*`;
      cursorOffset = 1;
      break;
    case 'underline':
      formatted = `__${selected || 'underlined text'}__`;
      cursorOffset = 2;
      break;
    case 'bullet':
      if (selected.includes('\n')) {
        formatted = selected.split('\n').map(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return line;
          return `- ${line}`;
        }).join('\n');
      } else {
        formatted = `- ${selected || 'list item'}`;
      }
      cursorOffset = 2;
      break;
  }
  
  textareaEl.value = text.substring(0, start) + formatted + text.substring(end);
  textareaEl.focus();
  
  textareaEl.selectionStart = start + cursorOffset;
  textareaEl.selectionEnd = start + cursorOffset + (selected || '').length;
}

// ---- Local Comment Ownership Helpers ----
function canEditComment(commentId, authorName) {
  const username = isLoggedIn(currentSession) ? getCurrentUsername(currentSession) : 'guest';
  const key = `perspecteave_my_comments_${username}`;
  const myComments = JSON.parse(localStorage.getItem(key) || '[]');
  const idStr = String(commentId);
  if (myComments.map(String).includes(idStr)) return true;
  
  // Also check if logged in as the author of the comment
  const loggedIn = isLoggedIn(currentSession);
  if (loggedIn && authorName) {
    const activeUser = getCurrentUsername(currentSession);
    if (activeUser && activeUser.trim().toLowerCase() === authorName.trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

function saveCommentOwnership(commentId) {
  const username = isLoggedIn(currentSession) ? getCurrentUsername(currentSession) : 'guest';
  const key = `perspecteave_my_comments_${username}`;
  const myComments = JSON.parse(localStorage.getItem(key) || '[]');
  const idStr = String(commentId);
  if (!myComments.map(String).includes(idStr)) {
    myComments.push(commentId);
    localStorage.setItem(key, JSON.stringify(myComments));
  }
}

function hasSubmittedComment(postId) {
  const postComments = appComments[postId] || [];
  const username = isLoggedIn(currentSession) ? getCurrentUsername(currentSession) : 'guest';
  const key = `perspecteave_my_comments_${username}`;
  const myComments = JSON.parse(localStorage.getItem(key) || '[]');
  
  // Check local storage ownership
  const hasLocalOwnership = postComments.some(c => myComments.map(String).includes(String(c.id)));
  if (hasLocalOwnership) return true;
  
  // Check if logged-in user matches any comment author name
  const loggedIn = isLoggedIn(currentSession);
  if (loggedIn) {
    const activeUser = getCurrentUsername(currentSession);
    if (activeUser) {
      const hasNamedComment = postComments.some(c => 
        c.name && c.name.trim().toLowerCase() === activeUser.trim().toLowerCase()
      );
      if (hasNamedComment) return true;
    }
  }
  return false;
}

// ---- Local Votes Toggling Helpers ----
function getPostVote(postId) {
  const username = isLoggedIn(currentSession) ? getCurrentUsername(currentSession) : 'guest';
  const key = `perspecteave_votes_${username}`;
  const votes = JSON.parse(localStorage.getItem(key) || '{}');
  return votes[Number(postId)] || null; // 'agree', 'disagree' or null
}

function setPostVote(postId, voteType) {
  const username = isLoggedIn(currentSession) ? getCurrentUsername(currentSession) : 'guest';
  const key = `perspecteave_votes_${username}`;
  const votes = JSON.parse(localStorage.getItem(key) || '{}');
  const id = Number(postId);
  if (voteType) {
    votes[id] = voteType;
  } else {
    delete votes[id];
  }
  localStorage.setItem(key, JSON.stringify(votes));
}

// ---- Visitor Tracking Helpers ----
function getOrCreateVisitorId() {
  let visitorId = localStorage.getItem('perspecteave_visitor_id');
  if (!visitorId) {
    visitorId = 'vis_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('perspecteave_visitor_id', visitorId);
  }
  return visitorId;
}

async function logVisit() {
  if (!isConfigured) return;
  const visitorId = getOrCreateVisitorId();
  try {
    // Step 1: Check if this visitor already has a guest_name assigned
    const { data: existingRows, error: existErr } = await supabase
      .from('visits')
      .select('guest_name')
      .eq('visitor_id', visitorId)
      .not('guest_name', 'is', null)
      .limit(1);

    let guestName = null;
    let guestNum = 1;

    if (!existErr && existingRows && existingRows.length > 0 && existingRows[0].guest_name) {
      // Reuse the same guest_name this visitor already has
      guestName = existingRows[0].guest_name;
      const match = guestName.match(/Guest\s+(\d+)/i);
      if (match) guestNum = parseInt(match[1], 10);
    } else {
      // Step 2: New visitor — find the highest guest number in the entire table
      const { data: allRows, error: allErr } = await supabase
        .from('visits')
        .select('guest_name');

      let maxNum = 0;
      if (!allErr && allRows && allRows.length > 0) {
        allRows.forEach(row => {
          if (row.guest_name) {
            const m = row.guest_name.match(/Guest\s+(\d+)/i);
            if (m) {
              const n = parseInt(m[1], 10);
              if (n > maxNum) maxNum = n;
            }
          }
        });
      }
      guestNum = maxNum + 1;
      guestName = `Guest ${guestNum}`;
    }

    currentGuestNumber = guestNum;

    // Step 3: Insert the visit row with the correct guest_name and IST time
    const istTime = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true
    });
    const { error } = await supabase
      .from('visits')
      .insert({ 
        visitor_id: visitorId,
        guest_name: guestName,
        ist_time: istTime
      });
    if (error) {
      console.warn('Could not log visit to Supabase (table may not exist yet or missing column):', error.message);
    }
  } catch (e) {
    console.warn('Failed to log visit:', e);
  }
}

async function fetchUniqueVisitorsCount() {
  if (!isConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('visits')
      .select('visitor_id');
    if (error) throw error;
    if (!data) return 0;
    const uniqueIds = new Set(data.map(item => item.visitor_id));
    return uniqueIds.size;
  } catch (e) {
    console.warn('Could not fetch unique visitors count:', e);
    return null;
  }
}

// ---- Post Views Tracking ----
const sessionLoggedViews = new Set();

async function logPostView(postId) {
  if (!postId) return;
  const numericId = Number(postId);
  
  if (sessionLoggedViews.has(numericId)) return;
  sessionLoggedViews.add(numericId);
  
  const visitorId = getOrCreateVisitorId();
  
  if (!isConfigured) {
    try {
      let localViews = load(VIEWS_KEY) || {};
      if (!localViews[numericId]) {
        localViews[numericId] = [];
      }
      if (!localViews[numericId].includes(visitorId)) {
        localViews[numericId].push(visitorId);
        save(VIEWS_KEY, localViews);
        const currentCount = (appPostViews[numericId] || 0) + 1;
        appPostViews[numericId] = currentCount;
        updateViewsUI(numericId, currentCount);
      }
    } catch (e) {
      console.warn('Failed to log post view locally:', e);
    }
    return;
  }

  try {
    const { error } = await supabase
      .from('post_views')
      .insert({
        post_id: numericId,
        visitor_id: visitorId
      });
    
    if (!error) {
      const currentCount = (appPostViews[numericId] || 0) + 1;
      appPostViews[numericId] = currentCount;
      updateViewsUI(numericId, currentCount);
    } else if (error.code === '23505') {
      // Postgres unique_violation is expected
    } else {
      console.warn('Failed to log post view to Supabase:', error.message);
    }
  } catch (err) {
    console.error('Error logging post view:', err);
  }
}

async function triggerPostView(postId) {
  if (!postId) return;
  await logPostView(Number(postId));
}

function updateViewsUI(postId, count) {
  const viewsEl = document.getElementById(`viewsCount-${postId}`);
  if (viewsEl) {
    viewsEl.textContent = `👁️ ${count || 0} view${count === 1 ? '' : 's'}`;
  }
}

async function determineGuestNumber() {
  if (currentGuestNumber !== null) return currentGuestNumber;
  if (!isConfigured) {
    currentGuestNumber = 1;
    return currentGuestNumber;
  }
  const visitorId = getOrCreateVisitorId();
  try {
    // Check if this visitor already has a guest_name
    const { data: myRows, error: myErr } = await supabase
      .from('visits')
      .select('guest_name')
      .eq('visitor_id', visitorId)
      .not('guest_name', 'is', null)
      .limit(1);

    if (!myErr && myRows && myRows.length > 0 && myRows[0].guest_name) {
      const match = myRows[0].guest_name.match(/Guest\s+(\d+)/i);
      if (match) {
        currentGuestNumber = parseInt(match[1], 10);
        return currentGuestNumber;
      }
    }

    // New visitor — find max guest number and assign next
    const { data: allRows, error: allErr } = await supabase
      .from('visits')
      .select('guest_name');

    let maxNum = 0;
    if (!allErr && allRows) {
      allRows.forEach(row => {
        if (row.guest_name) {
          const m = row.guest_name.match(/Guest\s+(\d+)/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxNum) maxNum = n;
          }
        }
      });
    }
    currentGuestNumber = maxNum + 1;
    return currentGuestNumber;
  } catch (e) {
    console.warn('Could not determine guest number:', e);
    currentGuestNumber = 1;
    return currentGuestNumber;
  }
}

// ---- Email Verification & Guest Restrictions Helpers ----
function isClientVerified(session) {
  return isLoggedIn(session);
}

// 10-Minute Guest Timer Logic (Legacy - Disabled)
function setupGuestTimer() {
  document.body.style.overflow = '';
  if (guestTimerTimeout) {
    clearTimeout(guestTimerTimeout);
    guestTimerTimeout = null;
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



// ---- Format Display Name (Strips Guest suffix) ----
function formatDisplayName(name) {
  if (!name) return '';
  return name.replace(/\s*\(Guest\s+\d+\)\s*$/i, '').trim();
}

// ---- Determine category-specific theme class for overlay ----
function getCategoryThemeClass(categories) {
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return 'theme-default';
  }
  // Use the first category as the primary one
  const primary = categories[0].toLowerCase();
  if (primary === 'scholarly' || ['history', 'politics', 'geopolitics', 'indian politics', 'case study'].includes(primary)) {
    return 'theme-scholarly';
  }
  if (primary === 'cosmic' || ['philosophy', '3am thoughts'].includes(primary)) {
    return 'theme-cosmic';
  }
  if (primary === 'science' || ['science & tech'].includes(primary)) {
    return 'theme-science';
  }
  if (primary === 'warm' || ['social', 'people', 'places'].includes(primary)) {
    return 'theme-warm';
  }
  return 'theme-default';
}

// ---- Render a Single Entry ----
function renderEntry(post, index) {
  const qNum = index + 1;
  const isComingSoon = isComingSoonText(post.perspective);

  let editInfo = '';
  if (post.edit_count > 0 && !isComingSoon) {
    editInfo = ` <span class="edit-info">(edited ${post.edit_count} time${post.edit_count > 1 ? 's' : ''})</span>`;
  }

  const currentVote = getPostVote(post.id);
  const agreeClass = currentVote === 'agree' ? 'active' : '';
  const disagreeClass = currentVote === 'disagree' ? 'active' : '';

  return `
    <article class="entry cup-container" data-entry-id="${post.id}" id="entry-${post.id}">
      
      <!-- ===== MUG (Grid View) ===== -->
      <div class="teacup" data-entry-id="${post.id}">
        <div class="mug-steam">
          <svg class="steam-wave" viewBox="0 0 12 28">
            <path d="M6,28 C2,20 10,12 6,4" fill="none" stroke="rgba(214, 142, 73, 0.25)" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <svg class="steam-wave" viewBox="0 0 12 28">
            <path d="M6,28 C10,20 2,12 6,4" fill="none" stroke="rgba(214, 142, 73, 0.25)" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <svg class="steam-wave" viewBox="0 0 12 28">
            <path d="M6,28 C3,22 9,14 6,4" fill="none" stroke="rgba(214, 142, 73, 0.25)" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </div>
        <div class="mug-body">
          <div class="mug-front">
            <span class="cup-number">${qNum}</span>
            <p class="cup-question">${escapeHTML(post.question)}</p>
          </div>
          <div class="mug-liquid"></div>
        </div>
        <div class="mug-handle"></div>
      </div>

      <!-- ===== EXPANDED (Top-down circle) ===== -->
      <div class="cup-topdown">
        <div class="topdown-saucer"></div>
        <div class="topdown-rim"></div>
        <div class="topdown-tea">
          <span class="topdown-number">${qNum}.</span>
          <p class="topdown-question">${escapeHTML(post.question)}</p>
        </div>
        <div class="topdown-handle"></div>
        <button class="btn-spill-tea" data-entry-id="${post.id}">
          <span class="spill-icon">☕</span> Spill the tea
        </button>
      </div>

      <!-- ===== SPILLED VIEW ===== -->
      <div class="spill-overlay ${getCategoryThemeClass(post.categories)}" id="spillOverlay-${post.id}">
        <!-- Animated stain layers -->
        <div class="stain stain-1"></div>
        <div class="stain stain-2"></div>
        <div class="stain stain-3"></div>
        <div class="stain-ring stain-ring-1"></div>
        <div class="stain-ring stain-ring-2"></div>

        <div class="spill-page">
          <button class="btn-close-spill" data-entry-id="${post.id}" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <div class="spill-header">
            <span class="spill-num">${qNum}.</span>
            <div class="spill-header-content">
              <h2 class="spill-question">${escapeHTML(post.question)}</h2>
            </div>
          </div>

          <div class="spill-body">
            <!-- Perspective -->
            <div class="entry-static-view" id="entryStatic-${post.id}">
              <p class="perspective">${(() => {
                const fullText = post.perspective;
                const charLimit = 800;
                if (fullText.length > charLimit) {
                  const truncated = fullText.substring(0, charLimit);
                  return `<span class="perspective-text-truncated" id="perspectiveTruncated-${post.id}">${parsePerspectiveMarkdown(truncated)}...<a href="#" class="btn-read-more" data-entry-id="${post.id}">Read more</a></span><span class="perspective-text-full" id="perspectiveFull-${post.id}" style="display: none;">${parsePerspectiveMarkdown(fullText)}</span>`;
                }
                return parsePerspectiveMarkdown(fullText);
              })()}${editInfo}</p>
              
              <div class="entry-admin-actions" data-entry-id="${post.id}">
                <button type="button" class="btn-entry-edit" data-entry-id="${post.id}">Edit</button>
                <button type="button" class="btn-entry-delete" data-entry-id="${post.id}">Delete</button>
              </div>
            </div>

            <!-- Edit Form -->
            <form class="entry-edit-form" id="entryEdit-${post.id}" onsubmit="return false;" style="display: none;">
              <div class="edit-field">
                <label>Question</label>
                <input type="text" class="edit-question-input" id="editQuestion-${post.id}" value="${escapeHTML(post.question)}" required>
              </div>
              <div class="edit-field edit-field-with-toolbar">
                <label>Perspective</label>
                <div class="formatting-toolbar" data-textarea-id="editPerspective-${post.id}">
                  <button type="button" class="btn-bold" title="Bold">B</button>
                  <button type="button" class="btn-italic" title="Italic">I</button>
                  <button type="button" class="btn-underline" title="Underline">U</button>
                  <button type="button" class="btn-bullet" title="Bullet List">•</button>
                </div>
                <textarea class="edit-perspective-textarea" id="editPerspective-${post.id}" required>${escapeHTML(post.perspective)}</textarea>
              </div>

              <div class="edit-category-select">
                <span class="category-select-label">Select Theme:</span>
                <div class="category-checkboxes-grid">
                  ${AVAILABLE_THEMES.map((theme, idx) => {
                    const matchesTheme = post.categories && post.categories.some(cat => {
                      const c = cat.toLowerCase();
                      if (theme.value === 'Scholarly') return ['scholarly', 'history', 'politics', 'geopolitics', 'indian politics', 'case study'].includes(c);
                      if (theme.value === 'Cosmic') return ['cosmic', 'philosophy', '3am thoughts'].includes(c);
                      if (theme.value === 'Science') return ['science', 'science & tech'].includes(c);
                      if (theme.value === 'Warm') return ['warm', 'social', 'people', 'places'].includes(c);
                      return false;
                    });
                    const isChecked = matchesTheme || (!post.categories && idx === 0) ? 'checked' : '';
                    return `
                      <label class="category-checkbox-label">
                        <input type="radio" name="editCategories-${post.id}" value="${theme.value}" ${isChecked}>
                        <span>${theme.label}</span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="edit-actions">
                <button type="button" class="btn-edit-save" data-entry-id="${post.id}">Save</button>
                <button type="button" class="btn-edit-cancel" data-entry-id="${post.id}">Cancel</button>
              </div>
            </form>

            <!-- Vote -->
            <div class="entry-actions-row" ${isComingSoon ? 'style="display: none !important;"' : ''}>
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
            </div>

            <!-- Comments & Share -->
            <div class="social-actions-row" ${isComingSoon ? 'style="display: none !important;"' : ''}>
              <button type="button" class="btn-view-comments" data-entry-id="${post.id}">
                <span class="comment-icon">💬</span>
                <span>Comments</span>
                <span class="total-comment-count" id="totalCount-${post.id}">0</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="comments-arrow"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <div class="post-views-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" class="views-svg-icon" style="margin-right: 6px; display: inline-block; vertical-align: middle;">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span class="views-badge-count" id="viewsCount-${post.id}">${(appPostViews[post.id] || 0)} view${(appPostViews[post.id] || 0) === 1 ? '' : 's'}</span>
              </div>
              <div class="share-btn-wrapper">
                <button type="button" class="btn-share-link" data-entry-id="${post.id}" title="Share this take">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" class="share-svg-icon" style="margin-right: 6px; display: inline-block; vertical-align: middle;">
                     <circle cx="18" cy="5" r="3"></circle>
                     <circle cx="6" cy="12" r="3"></circle>
                     <circle cx="18" cy="19" r="3"></circle>
                     <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                     <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                  </svg>
                  <span class="share-status-text">Share</span>
                </button>
              </div>
            </div>

            <div class="comments-section" style="display:none; ${isComingSoon ? 'display: none !important;' : ''}">
              <div class="comments-body" id="commentsBody-${post.id}">
                <ul class="comments-list" id="commentsList-${post.id}"></ul>
                <div class="inline-comment-area" id="inlineCommentArea-${post.id}">
                  <button type="button" class="btn-add-inline-comment" data-entry-id="${post.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add a comment
                  </button>
                  <form class="reply-form inline-comment-form" data-entry-id="${post.id}" onsubmit="return false;" style="display:none;">
                    <input type="text" class="reply-name" placeholder="Your name">
                    <div class="textarea-wrapper">
                      <textarea class="comment-text reply-text" placeholder="What are your thoughts?"></textarea>
                      <button type="button" class="btn-submit-circle btn-comment-submit" data-entry-id="${post.id}" title="Post comment">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Render a single nested reply card
function renderReplyCard(reply, entryId, parentId) {
  const editable = canEditComment(reply.id, reply.name);
  const editButton = editable ? `
    <button type="button" class="btn-comment-edit" data-comment-id="${reply.id}">Edit</button>
  ` : '';
  
  const hasHistory = reply.history && reply.history.length > 0;
  const totalVersions = hasHistory ? reply.history.length + 1 : 1;
  const historyNav = hasHistory ? `
    <div class="comment-history-nav" data-comment-id="${reply.id}" data-current-index="${reply.history.length}" data-total-versions="${totalVersions}">
      <button type="button" class="btn-comment-undo" data-comment-id="${reply.id}" title="Show previous version">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
      </button>
      <span class="comment-version-indicator" id="versionIndicator-${reply.id}">v${totalVersions}/${totalVersions}</span>
      <button type="button" class="btn-comment-redo" data-comment-id="${reply.id}" title="Show next version" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
      </button>
    </div>
  ` : '';

  const isUserAdmin = isAdmin(currentSession);
  const deleteButton = isUserAdmin ? `
    <button type="button" class="btn-comment-delete" data-comment-id="${reply.id}" data-entry-id="${entryId}">Delete</button>
  ` : '';
  const hideButton = isUserAdmin ? `
    <button type="button" class="btn-comment-hide" data-comment-id="${reply.id}" data-entry-id="${entryId}">${reply.hidden ? 'Unhide' : 'Hide'}</button>
  ` : '';

  const replyButton = `
    <button type="button" class="btn-comment-reply-trigger" data-comment-id="${parentId}" data-reply-id="${reply.id}" data-entry-id="${entryId}" data-reply-to-author="${escapeHTML(formatDisplayName(reply.name) || 'Anonymous')}">Reply</button>
  `;

  const showAsHidden = reply.hidden && isUserAdmin;

  return `
    <li class="reply-card comment-card${showAsHidden ? ' comment-hidden' : ''}" id="comment-${reply.id}">
      <div class="comment-card-static" id="commentStatic-${reply.id}">
        <div class="comment-card-meta">
          <div>
            <span class="comment-card-author">${escapeHTML(formatDisplayName(reply.name) || 'Anonymous')}</span>
            ${reply.edited ? `<span class="comment-edited-tag">(edited)</span>` : ''}
          </div>
          <div class="comment-meta-right">
            <span class="comment-card-time">${escapeHTML(reply.time || 'Just now')}</span>
            ${historyNav}
            ${replyButton}
            ${editButton}
            ${hideButton}
            ${deleteButton}
          </div>
        </div>
        <p class="comment-card-text">${escapeHTML(reply.text)}</p>
      </div>
      
      <!-- Inline Comment Edit Form (Hidden by default) -->
      <form class="comment-edit-form" id="commentEdit-${reply.id}" onsubmit="return false;" style="display: none;">
        <textarea class="comment-edit-textarea" id="commentEditTextarea-${reply.id}" required>${escapeHTML(reply.text)}</textarea>
        <div class="comment-edit-actions">
          <button type="button" class="btn-comment-save" data-comment-id="${reply.id}">Save</button>
          <button type="button" class="btn-comment-cancel" data-comment-id="${reply.id}">Cancel</button>
        </div>
      </form>
    </li>
  `;
}

// Render a single comment card
function renderCommentCard(item, entryId, replies = []) {
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

  const isUserAdmin = isAdmin(currentSession);
  const deleteButton = isUserAdmin ? `
    <button type="button" class="btn-comment-delete" data-comment-id="${item.id}" data-entry-id="${entryId}">Delete</button>
  ` : '';
  const hideButton = isUserAdmin ? `
    <button type="button" class="btn-comment-hide" data-comment-id="${item.id}" data-entry-id="${entryId}">${item.hidden ? 'Unhide' : 'Hide'}</button>
  ` : '';

  const replyButton = `
    <button type="button" class="btn-comment-reply-trigger" data-comment-id="${item.id}" data-reply-id="${item.id}" data-entry-id="${entryId}">Reply</button>
  `;

  // Render nested replies
  let repliesHTML = '';
  if (replies.length > 0) {
    repliesHTML = `
      <ul class="replies-list">
        ${replies.map(reply => renderReplyCard(reply, entryId, item.id)).join('')}
      </ul>
    `;
  }

  // Toggled inline reply form (initially hidden)
  const isGuestOrLoggedIn = isLoggedIn(currentSession);
  const lastGuestName = localStorage.getItem('perspecteave_last_guest_name') || '';
  const replyFormHTML = `
    <form class="reply-to-comment-form" id="replyToCommentForm-${item.id}" data-entry-id="${entryId}" data-parent-id="${item.id}" onsubmit="return false;" style="display: none;">
      ${!isGuestOrLoggedIn ? `<input type="text" class="reply-to-comment-name" placeholder="Your name" value="${escapeHTML(formatDisplayName(lastGuestName))}" ${lastGuestName ? 'disabled' : ''}>` : ''}
      <div class="textarea-wrapper mini-textarea-wrapper">
        <textarea class="reply-to-comment-text" placeholder="Reply to this comment..."></textarea>
        <button type="button" class="btn-submit-circle-mini btn-reply-to-comment" data-entry-id="${entryId}" data-parent-id="${item.id}" title="Submit reply">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
      <div class="reply-to-comment-actions" style="display: flex; gap: var(--space-xs); justify-content: flex-end; margin-top: var(--space-xs);">
        <button type="button" class="btn-comment-reply-cancel btn-comment-cancel" data-comment-id="${item.id}">Cancel</button>
      </div>
    </form>
  `;

  const showAsHidden = item.hidden && isUserAdmin;

  return `
    <li class="comment-card${showAsHidden ? ' comment-hidden' : ''}" id="comment-${item.id}">
      <div class="comment-card-static" id="commentStatic-${item.id}">
        <div class="comment-card-meta">
          <div>
            <span class="comment-card-author">${escapeHTML(formatDisplayName(item.name) || 'Anonymous')}</span>
            ${item.edited ? `<span class="comment-edited-tag">(edited)</span>` : ''}
          </div>
          <div class="comment-meta-right">
            <span class="comment-card-time">${escapeHTML(item.time || 'Just now')}</span>
            ${historyNav}
            ${replyButton}
            ${editButton}
            ${hideButton}
            ${deleteButton}
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

      <!-- Nested Replies & Inline Reply Form -->
      <div class="replies-container">
        ${repliesHTML}
        ${replyFormHTML}
      </div>
    </li>
  `;
}

// ---- Render all entries ----
function renderAllEntries(posts) {
  const container = document.getElementById('entriesList');
  if (container) {
    // 1. Remember expanded entry ID
    const expandedEntry = container.querySelector('.entry.expanded');
    const expandedId = expandedEntry ? expandedEntry.getAttribute('data-entry-id') : null;

    // 1b. Remember spilled cup container ID
    const spilledEntry = container.querySelector('.cup-container.spilled');
    const spilledId = spilledEntry ? spilledEntry.getAttribute('data-entry-id') : null;

    // 2. Remember open comments bodies
    const openCommentsIds = [];
    container.querySelectorAll('.comments-body.open').forEach(body => {
      const id = body.id.replace('commentsBody-', '');
      if (id) openCommentsIds.push(id);
    });

    // 3. Render all entries
    container.innerHTML = posts.map((p, i) => renderEntry(p, i)).join('');

    // 4. Restore expanded entry ID if any
    if (expandedId) {
      const entryToExpand = container.querySelector(`.entry[data-entry-id="${expandedId}"]`);
      if (entryToExpand) {
        entryToExpand.classList.add('expanded');
      }
    }

    // 4b. Restore spilled entry ID if any (checks previous state OR URL query parameter on load)
    const urlParams = new URLSearchParams(window.location.search);
    const postIdParam = urlParams.get('post');
    const targetSpilledId = spilledId || postIdParam;

    if (targetSpilledId) {
      const entryToSpill = container.querySelector(`.cup-container[data-entry-id="${targetSpilledId}"]`);
      if (entryToSpill) {
        entryToSpill.classList.add('spilled');
      }
    }

    // 5. Restore open comments bodies and their button states
    openCommentsIds.forEach(id => {
      const body = container.querySelector(`#commentsBody-${id}`);
      if (body) body.classList.add('open');
      const btn = container.querySelector(`.btn-view-comments[data-entry-id="${id}"]`);
      if (btn) btn.classList.add('open');
    });
  }
}

// ---- Render comments for one entry ----
function renderComments(entryId, comments) {
  const list = comments[entryId] || [];
  const listEl = document.getElementById(`commentsList-${entryId}`);
  const tCount = document.getElementById(`totalCount-${entryId}`);

  const parentComments = [];
  const repliesByParentId = {};

  const isUserAdmin = isAdmin(currentSession);

  list.forEach(c => {
    // Non-admin users don't see hidden comments at all, unless they are the author of the comment
    if (c.hidden && !isUserAdmin && !canEditComment(c.id, c.name)) return;

    // Check if this comment is a reply (starts with [reply_to:parentId])
    const match = typeof c.text === 'string' && c.text.match(/^\[reply_to:(\d+)\]\s*([\s\S]*)$/);
    if (match) {
      const parentId = Number(match[1]);
      if (!repliesByParentId[parentId]) repliesByParentId[parentId] = [];
      repliesByParentId[parentId].push({
        ...c,
        text: match[2] // Strip prefix for display
      });
    } else {
      parentComments.push(c);
    }
  });

  if (listEl) {
    let html = parentComments.length
      ? parentComments.map(c => renderCommentCard(c, entryId, repliesByParentId[c.id] || [])).join('')
      : '<li class="no-comments">No comments yet. Be the first!</li>';

    // No login prompt required
    listEl.innerHTML = html;
  }
  if (tCount) tCount.textContent = parentComments.length;

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

  // No login required to critique

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
    const guestNum = currentGuestNumber || 1;
    const suffix = `(Guest ${guestNum})`;
    if (!name.includes(suffix)) {
      name = `${name} ${suffix}`;
    }
    localStorage.setItem('perspecteave_last_guest_name', name);
    updateCommentForms(session);
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
      hidden: false,
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

      if (name !== 'teaboy27') {
        sendPushNotification(
          `New Critique from ${name}`,
          `On Perspective #${entryId}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`
        );
      }

      if (!appComments[entryId]) appComments[entryId] = [];
      appComments[entryId].push({
        id: data.id,
        name: data.name,
        text: data.text,
        edited: data.edited || false,
        history: data.history || [],
        hidden: data.hidden || false,
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
  setCommentsExpanded(entryId, true);

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

// ---- Submit a comment from the inline form inside the comments feed ----
async function submitComment(entryId) {
  const entry = document.querySelector(`.entry[data-entry-id="${entryId}"]`);
  if (!entry) return;
  const form = entry.querySelector('.inline-comment-form');
  if (!form) return;
  const nameInput = form.querySelector('.reply-name');
  const textArea = form.querySelector('.comment-text');
  const btn = form.querySelector('.btn-comment-submit');

  const text = (textArea.value || '').trim();
  if (!text) {
    textArea.style.borderColor = 'var(--accent-tea)';
    textArea.focus();
    setTimeout(() => { textArea.style.borderColor = ''; }, 1500);
    return;
  }

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
    const guestNum = currentGuestNumber || 1;
    const suffix = `(Guest ${guestNum})`;
    if (!name.includes(suffix)) name = `${name} ${suffix}`;
    localStorage.setItem('perspecteave_last_guest_name', name);
    updateCommentForms(session);
  }

  const origHTML = btn.innerHTML;
  btn.innerHTML = '✓';
  btn.classList.add('submitted');
  btn.disabled = true;

  if (!isConfigured) {
    if (!appComments[entryId]) appComments[entryId] = [];
    const newCommentId = Date.now() + Math.floor(Math.random() * 1000);
    appComments[entryId].push({
      id: newCommentId,
      name,
      text,
      edited: false,
      history: [],
      hidden: false,
      time: 'Just now'
    });
    save(COMMENTS_KEY, appComments);
    saveCommentOwnership(newCommentId);
    renderComments(entryId, appComments);
    
    setTimeout(() => {
      textArea.value = '';
      if (nameInput && !loggedIn) nameInput.value = '';
      btn.innerHTML = origHTML;
      btn.classList.remove('submitted');
      btn.disabled = false;
      // Collapse the form, reset the toggle button
      if (form) form.style.display = 'none';
      const toggleBtn = entry.querySelector('.btn-add-inline-comment');
      if (toggleBtn) toggleBtn.classList.remove('active');
      const commentsList = document.getElementById(`commentsList-${entryId}`);
      const last = commentsList ? commentsList.lastElementChild : null;
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  } else {
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: entryId,
          type: 'critique', // Consolidated to 'critique' type under the hood
          name,
          text
        })
        .select('*')
        .single();

      if (error) throw error;

      if (name !== 'teaboy27') {
        sendPushNotification(
          `New Critique from ${name}`,
          `On Perspective #${entryId}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`
        );
      }

      if (!appComments[entryId]) appComments[entryId] = [];
      appComments[entryId].push({
        id: data.id,
        name: data.name,
        text: data.text,
        edited: data.edited || false,
        history: data.history || [],
        hidden: data.hidden || false,
        time: 'Just now'
      });
      saveCommentOwnership(data.id);
      renderComments(entryId, appComments);
      
      setTimeout(() => {
        textArea.value = '';
        if (nameInput && !loggedIn) nameInput.value = '';
        btn.innerHTML = origHTML;
        btn.classList.remove('submitted');
        btn.disabled = false;
        // Collapse the form, reset the toggle button
        if (form) form.style.display = 'none';
        const toggleBtn = entry.querySelector('.btn-add-inline-comment');
        if (toggleBtn) toggleBtn.classList.remove('active');
        const commentsList = document.getElementById(`commentsList-${entryId}`);
        const last = commentsList ? commentsList.lastElementChild : null;
        if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    } catch (err) {
      console.error('Error submitting inline comment to Supabase:', err);
      alert('Could not submit comment to the database. Check console for details.');
      btn.innerHTML = origHTML;
      btn.classList.remove('submitted');
      btn.disabled = false;
    }
  }
}

// ---- Save Comment Edit ----
async function saveCommentEdit(commentId) {
  let entryId = null;
  let commentIndex = -1;
  
  for (const postId in appComments) {
    const idx = appComments[postId].findIndex(c => Number(c.id) === Number(commentId));
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
  const match = typeof currentComment.text === 'string' && currentComment.text.match(/^\[reply_to:\d+\]\s*/);
  const prefix = match ? match[0] : '';
  const finalDbText = prefix + newText;

  const updatedHistory = [...(currentComment.history || [])];
  
  // Push old text to history if it has changed and is not already the last history entry
  if (currentComment.text !== finalDbText) {
    updatedHistory.push(currentComment.text);
  }
  
  if (!isConfigured) {
    // Local fallback
    appComments[entryId][commentIndex].text = finalDbText;
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
          text: finalDbText,
          edited: true,
          history: updatedHistory
        })
        .eq('id', commentId);
        
      if (error) {
        // Fallback for missing history/edited columns in database
        console.warn('Supabase comment update failed, trying fallback to text only...', error);
        const { error: textOnlyError } = await supabase
          .from('comments')
          .update({ text: finalDbText })
          .eq('id', commentId);
        if (textOnlyError) throw textOnlyError;
      }
      
      appComments[entryId][commentIndex].text = finalDbText;
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

// ---- Submit a reply to a critique ----
async function submitCommentReply(entryId, parentId) {
  const form = document.getElementById(`replyToCommentForm-${parentId}`);
  if (!form) return;

  const nameInput = form.querySelector('.reply-to-comment-name');
  const textArea = form.querySelector('.reply-to-comment-text');
  const btn = form.querySelector('.btn-reply-to-comment');

  const text = (textArea.value || '').trim();
  if (!text) {
    textArea.style.borderColor = 'var(--accent-tea)';
    textArea.focus();
    setTimeout(() => { textArea.style.borderColor = ''; }, 1500);
    return;
  }

  // No login required to reply

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
      alert('Please enter your name to post a reply.');
      return;
    }
    const guestNum = currentGuestNumber || 1;
    const suffix = `(Guest ${guestNum})`;
    if (!name.includes(suffix)) {
      name = `${name} ${suffix}`;
    }
    localStorage.setItem('perspecteave_last_guest_name', name);
    updateCommentForms(session);
  }

  // Prefix the reply text with the parent id
  const dbText = `[reply_to:${parentId}] ${text}`;

  const origHTML = btn.innerHTML;
  btn.innerHTML = '✓';
  btn.classList.add('submitted');
  btn.disabled = true;

  if (!isConfigured) {
    // Local fallback logic
    if (!appComments[entryId]) appComments[entryId] = [];
    const newCommentId = Date.now() + Math.floor(Math.random() * 1000);
    appComments[entryId].push({
      id: newCommentId,
      name,
      text: dbText,
      edited: false,
      history: [],
      hidden: false,
      time: 'Just now'
    });
    save(COMMENTS_KEY, appComments);
    saveCommentOwnership(newCommentId);
    renderComments(entryId, appComments);
    
    // Clear and restore submit button
    setTimeout(() => {
      textArea.value = '';
      if (nameInput) nameInput.value = '';
      btn.innerHTML = origHTML;
      btn.classList.remove('submitted');
      btn.disabled = false;
      form.style.display = 'none';
      form.removeAttribute('data-active-reply-id');
    }, 1000);
  } else {
    // Live database logic
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: entryId,
          type: 'critique',
          name,
          text: dbText
        })
        .select('*')
        .single();

      if (error) throw error;

      if (name !== 'teaboy27') {
        sendPushNotification(
          `New Critique from ${name}`,
          `On Perspective #${entryId}: "${dbText.substring(0, 60)}${dbText.length > 60 ? '...' : ''}"`
        );
      }

      if (!appComments[entryId]) appComments[entryId] = [];
      appComments[entryId].push({
        id: data.id,
        name: data.name,
        text: data.text,
        edited: data.edited || false,
        history: data.history || [],
        hidden: data.hidden || false,
        time: 'Just now'
      });
      saveCommentOwnership(data.id);
      renderComments(entryId, appComments);
    } catch (err) {
      console.error('Error submitting reply to Supabase:', err);
      alert('Could not submit reply to the database. Check console for details.');
    } finally {
      setTimeout(() => {
        textArea.value = '';
        if (nameInput) nameInput.value = '';
        btn.innerHTML = origHTML;
        btn.classList.remove('submitted');
        btn.disabled = false;
        form.style.display = 'none';
        form.removeAttribute('data-active-reply-id');
      }, 1000);
    }
  }
}

// ---- Delete Comment / Reply ----
async function deleteComment(entryId, commentId) {
  const commentsList = appComments[entryId] || [];
  const commentToDelete = commentsList.find(c => Number(c.id) === Number(commentId));
  
  let isReply = false;
  if (commentToDelete) {
    isReply = typeof commentToDelete.text === 'string' && commentToDelete.text.startsWith('[reply_to:');
  }

  // Decrement disagrees count of the post by 1 if deleting a parent comment
  const postIndex = appPosts.findIndex(x => Number(x.id) === Number(entryId));
  if (postIndex !== -1 && commentToDelete && !isReply) {
    const currentPost = appPosts[postIndex];
    const newDisagrees = Math.max(0, (currentPost.disagrees || 0) - 1);
    
    if (!isConfigured) {
      appPosts[postIndex].disagrees = newDisagrees;
      save(POSTS_KEY, appPosts);
      updateVoteUI(entryId, currentPost.agrees, newDisagrees, getPostVote(entryId));
    } else {
      try {
        const { error } = await supabase
          .from('posts')
          .update({ disagrees: newDisagrees })
          .eq('id', entryId);
        if (error) throw error;
        
        appPosts[postIndex].disagrees = newDisagrees;
        updateVoteUI(entryId, currentPost.agrees, newDisagrees, getPostVote(entryId));
      } catch (err) {
        console.error('Error updating post disagrees count in Supabase:', err);
      }
    }
  }

  if (!isConfigured) {
    // Local fallback
    if (appComments[entryId]) {
      // Find all replies to this comment to delete them as well
      const replies = appComments[entryId].filter(x => typeof x.text === 'string' && x.text.startsWith(`[reply_to:${commentId}]`));
      const replyIds = replies.map(r => Number(r.id));
      
      // Filter out this comment and all its replies
      appComments[entryId] = appComments[entryId].filter(x => Number(x.id) !== Number(commentId) && !replyIds.includes(Number(x.id)));
      save(COMMENTS_KEY, appComments);
    }
  } else {
    // Supabase
    try {
      // Delete parent comment
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      // Delete replies
      const { error: replyError } = await supabase
        .from('comments')
        .delete()
        .like('text', `[reply_to:${commentId}] %`);

      if (replyError) {
        console.warn('Could not delete replies from Supabase:', replyError);
      }

      if (appComments[entryId]) {
        const replies = appComments[entryId].filter(x => typeof x.text === 'string' && x.text.startsWith(`[reply_to:${commentId}]`));
        const replyIds = replies.map(r => Number(r.id));
        appComments[entryId] = appComments[entryId].filter(x => Number(x.id) !== Number(commentId) && !replyIds.includes(Number(x.id)));
      }
    } catch (err) {
      console.error('Error deleting comment from Supabase:', err);
      alert('Could not delete comment. Check console.');
      return;
    }
  }

  // Re-render comments for this post
  renderComments(entryId, appComments);
}

// ---- Toggle Hide/Unhide Comment ----
async function toggleHideComment(entryId, commentId) {
  const commentsList = appComments[entryId] || [];
  const comment = commentsList.find(c => Number(c.id) === Number(commentId));
  if (!comment) return;

  const newHidden = !comment.hidden;

  if (!isConfigured) {
    // Local fallback
    comment.hidden = newHidden;
    save(COMMENTS_KEY, appComments);
  } else {
    // Supabase
    try {
      const { error } = await supabase
        .from('comments')
        .update({ hidden: newHidden })
        .eq('id', commentId);

      if (error) throw error;
      comment.hidden = newHidden;
    } catch (err) {
      console.error('Error toggling comment visibility:', err);
      alert('Could not update comment visibility. Check console.');
      return;
    }
  }

  // Re-render comments for this post
  renderComments(entryId, appComments);
}

// ---- Thumbs Up/Down Voting Logic ----
async function toggleVote(entryId, voteType) {
  const postIndex = appPosts.findIndex(x => Number(x.id) === Number(entryId));
  if (postIndex === -1) return;

  // No login required to vote disagree

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

      if (!isAdmin(currentSession)) {
        if (newVote === 'agree') {
          sendPushNotification(
            `New Like (Agree) 👍`,
            `Someone liked Perspective #${entryId}: "${currentPost.question.substring(0, 50)}${currentPost.question.length > 50 ? '...' : ''}"`
          );
        } else if (newVote === 'disagree') {
          sendPushNotification(
            `New Dislike (Disagree) 👎`,
            `Someone disliked Perspective #${entryId}: "${currentPost.question.substring(0, 50)}${currentPost.question.length > 50 ? '...' : ''}"`
          );
        }
      }
      
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

  // Open/close the inline comment form based on Thumbs Down / Disagree active vote state
  const body = document.getElementById(`commentsBody-${entryId}`);
  const section = body ? body.closest('.comments-section') : null;
  const form = section ? section.querySelector('.inline-comment-form') : null;
  const toggleBtn = section ? section.querySelector('.btn-add-inline-comment') : null;

  if (form) {
    if (activeVote === 'disagree') {
      // First, expand the comments section
      setCommentsExpanded(entryId, true);
      // Display the inline comment form
      form.style.display = 'block';
      if (toggleBtn) toggleBtn.classList.add('active');
      
      setTimeout(() => {
        const ta = form.querySelector('.comment-text');
        if (ta) {
          ta.focus();
          ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 450); // wait for comments transition to complete
    } else {
      form.style.display = 'none';
      if (toggleBtn) toggleBtn.classList.remove('active');
      const ta = form.querySelector('.comment-text');
      if (ta) ta.value = '';
    }
  }
}

// ---- Save Post Edit ----
async function savePostEdit(entryId) {
  try {
    const qInput = document.getElementById(`editQuestion-${entryId}`);
    const pInput = document.getElementById(`editPerspective-${entryId}`);
    if (!qInput || !pInput) {
      alert('Could not find the question or perspective edit input elements.');
      return;
    }
    const q = (qInput.value || '').trim();
    const p = (pInput.value || '').trim();

    if (!q || !p) {
      alert('Both question and perspective are required.');
      return;
    }

    const postIndex = appPosts.findIndex(x => Number(x.id) === Number(entryId));
    if (postIndex === -1) {
      alert('Could not find the post index.');
      return;
    }

    const currentPost = appPosts[postIndex];
    const wasComingSoon = isComingSoonText(currentPost.perspective);
    const isNowComingSoon = isComingSoonText(p);

    let newEditCount = currentPost.edit_count || 0;
    if (!wasComingSoon && !isNowComingSoon) {
      newEditCount = (currentPost.edit_count || 0) + 1;
    } else if (wasComingSoon && !isNowComingSoon) {
      newEditCount = 0;
    } else {
      newEditCount = 0;
    }

    const checkedCats = [];
    const selectedRadio = document.querySelector(`input[name="editCategories-${entryId}"]:checked`);
    if (selectedRadio) {
      checkedCats.push(selectedRadio.value);
    } else {
      checkedCats.push('Scholarly');
    }

    if (!isConfigured) {
      // Local fallback
      appPosts[postIndex].question = q;
      appPosts[postIndex].perspective = p;
      appPosts[postIndex].edit_count = newEditCount;
      appPosts[postIndex].categories = checkedCats;
      save(POSTS_KEY, appPosts);
    } else {
      // Supabase
      const saveBtn = document.querySelector(`.btn-edit-save[data-entry-id="${entryId}"]`);
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }
      
      const { error } = await supabase
        .from('posts')
        .update({
          question: q,
          perspective: p,
          edit_count: newEditCount,
          categories: checkedCats
        })
        .eq('id', entryId);

      if (error) throw error;
      
      appPosts[postIndex].question = q;
      appPosts[postIndex].perspective = p;
      appPosts[postIndex].edit_count = newEditCount;
      appPosts[postIndex].categories = checkedCats;
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

  } catch (err) {
    console.error('Error saving post edit:', err);
    alert('Could not save edit. Error: ' + err.message);
  }
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
  const lastGuestName = localStorage.getItem('perspecteave_last_guest_name') || '';

  document.querySelectorAll('.reply-form').forEach(form => {
    const nameInput = form.querySelector('.reply-name');
    if (nameInput) {
      if (loggedIn) {
        nameInput.value = username;
        nameInput.style.display = 'none';
      } else {
        nameInput.value = formatDisplayName(lastGuestName);
        nameInput.style.display = 'block';
        nameInput.placeholder = 'Your name';
        if (lastGuestName) {
          nameInput.disabled = true;
        } else {
          nameInput.disabled = false;
        }
      }
    }
  });

  const requestNameInput = document.getElementById('requestName');
  if (requestNameInput) {
    if (loggedIn) {
      requestNameInput.value = username;
      requestNameInput.style.display = 'none';
    } else {
      requestNameInput.value = formatDisplayName(lastGuestName);
      requestNameInput.style.display = 'block';
      requestNameInput.placeholder = 'Your name';
      if (lastGuestName) {
        requestNameInput.disabled = true;
      } else {
        requestNameInput.disabled = false;
      }
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

  const username = getCurrentUsername(session);
  const email = isConfigured ? (session?.user?.email || '') : (sessionStorage.getItem('perspecteave_auth_email') || '');

  const stateChanged = !lastRenderedState.initialized ||
                       lastRenderedState.loggedIn !== loggedIn ||
                       lastRenderedState.adminLoggedIn !== adminLoggedIn ||
                       lastRenderedState.username !== username ||
                       lastRenderedState.email !== email;

  if (stateChanged) {
    // Render entries and comments dynamically based on auth/verification state
    renderAllEntries(appPosts);
    if (appPosts.length > 0) {
      appPosts.forEach(post => renderComments(post.id, appComments));
    }

    // Refresh event listeners since entries list was re-rendered
    attachEventListeners();

    // Update tracking state
    lastRenderedState = {
      loggedIn,
      adminLoggedIn,
      username,
      email,
      initialized: true
    };
  }

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
    const adminMessagesWrapper = document.getElementById('adminMessagesWrapper');
    const dropdownNotificationsBtn = document.getElementById('dropdownNotificationsBtn');
    if (adminLoggedIn) {
      newPostBtn.style.display = 'flex';
      if (dropdownNotificationsBtn) {
        dropdownNotificationsBtn.style.display = 'flex';
        updateNotificationsBtnUI();
      }
      if (askAuthorWrapper) askAuthorWrapper.style.display = 'none';
      if (adminMessagesWrapper) adminMessagesWrapper.style.display = 'block';
      const requestDropdown = document.getElementById('requestDropdown');
      if (requestDropdown) {
        requestDropdown.classList.remove('open');
      }
      const askAuthorBtn = document.getElementById('askAuthorBtn');
      if (askAuthorBtn) askAuthorBtn.classList.remove('active');
      renderAdminRequests();
      updateMessagesBadge();
      subscribeToAdminNotifications();
    } else {
      newPostBtn.style.display = 'none';
      unsubscribeFromAdminNotifications();
      if (dropdownNotificationsBtn) dropdownNotificationsBtn.style.display = 'none';
      if (askAuthorWrapper) askAuthorWrapper.style.display = 'block';
      if (adminMessagesWrapper) adminMessagesWrapper.style.display = 'none';
    }
  } else {
    loginBtn.style.display = 'none';
    if (profileWidget) profileWidget.style.display = 'none';
    newPostBtn.style.display = 'none';
    unsubscribeFromAdminNotifications();
    const dropdownNotificationsBtn = document.getElementById('dropdownNotificationsBtn');
    if (dropdownNotificationsBtn) dropdownNotificationsBtn.style.display = 'none';
    panel.classList.remove('open');
    
    const askAuthorWrapper = document.getElementById('askAuthorWrapper');
    if (askAuthorWrapper) askAuthorWrapper.style.display = 'block';
    const adminMessagesWrapper = document.getElementById('adminMessagesWrapper');
    if (adminMessagesWrapper) adminMessagesWrapper.style.display = 'none';
  }
  
  if (!adminLoggedIn) {
    renderUserRequests();
    updateUserMessagesBadge();
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
  let activeSignInTitle = 'Welcome back';

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
      modalTitle.textContent = activeSignInTitle;
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

  // Expose function globally so guest timer can trigger it
  globalOpenAuthModal = function(mode, customTitle = null) {
    activeSignInTitle = customTitle || 'Welcome back';
    loginOverlay.classList.add('open');
    setAuthMode(mode);
    loginUsername.value = '';
    loginPassword.value = '';
    loginError.style.display = 'none';
  };

  // Open login modal via double-click on teacup logo
  const logoWrapper = document.querySelector('.logo-wrapper');
  if (logoWrapper) {
    logoWrapper.addEventListener('dblclick', () => {
      globalOpenAuthModal('signin', 'Admin Login');
    });
  }

  // Open login modal via URL hash route #admin
  const checkHashRoute = () => {
    if (window.location.hash === '#admin') {
      window.location.hash = ''; // clear hash
      globalOpenAuthModal('signin', 'Admin Login');
    }
  };
  window.addEventListener('hashchange', checkHashRoute);
  // Also check on initial load after a brief delay
  setTimeout(checkHashRoute, 500);

  // Show login modal
  loginBtn.addEventListener('click', () => {
    globalOpenAuthModal('signin', 'Welcome back');
    setTimeout(() => loginUsername.focus(), 300);
  });

  // Close login modal
  loginCloseBtn.addEventListener('click', () => {
    loginOverlay.classList.remove('open');
  });

  loginOverlay.addEventListener('click', (e) => {
    if (e.target === loginOverlay) loginOverlay.classList.remove('open');
  });

  // Attempt Login / Sign Up
  async function attemptAuth() {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username || !password) {
      loginError.textContent = 'Please enter both username and password';
      loginError.style.display = 'block';
      return;
    }

    const email = username.toLowerCase() + '@perspecteave.com';

    if (!isConfigured) {
      // Local mockup auth fallback
      const mockUsers = JSON.parse(localStorage.getItem('perspecteave_mock_users') || '[]');
      if (authMode === 'signin') {
        const found = mockUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        
        if (username.toLowerCase() === 'teaboy27' && password === 'perspecteave') {
          sessionStorage.setItem('perspecteave_auth_session', 'true');
          sessionStorage.setItem('perspecteave_auth_username', 'teaboy27');
          sessionStorage.setItem('perspecteave_auth_email', 'teaboy27@perspecteave.com');
          sessionStorage.setItem('perspecteave_auth_verified', 'true');
          loginOverlay.classList.remove('open');
          updateAuthUI();
        } else if (found) {
          sessionStorage.setItem('perspecteave_auth_session', 'true');
          sessionStorage.setItem('perspecteave_auth_username', found.username);
          sessionStorage.setItem('perspecteave_auth_email', found.email);
          sessionStorage.setItem('perspecteave_auth_verified', 'true');
          loginOverlay.classList.remove('open');
          updateAuthUI();
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
        updateAuthUI();
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
          updateAuthUI(data.session);
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
            // Check if username is already taken by checking identities
            const isTaken = data.user && data.user.identities && data.user.identities.length === 0;
            if (isTaken) {
              throw new Error('This username is already taken. Please try another one.');
            } else {
              // Sign up succeeded, but email confirmation is required by Supabase settings
              throw new Error("Signup successful, but email confirmation is enabled in Supabase! Please disable 'Confirm email' under Auth -> Providers -> Email in your Supabase dashboard to allow instant username/password login.");
            }
          }

          currentSession = data.session;
          loginOverlay.classList.remove('open');
          updateAuthUI(data.session);
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


  // Profile dropdown toggling
  if (profileTrigger && profileDropdown) {
    profileTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('open');
      profileTrigger.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!document.body.contains(e.target)) return;
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
      setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
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

    const checkedCats = [];
    const selectedRadio = document.querySelector('#adminCategoryCheckboxes input[type="radio"]:checked');
    if (selectedRadio) {
      checkedCats.push(selectedRadio.value);
    } else {
      checkedCats.push('Scholarly');
    }

    if (!isConfigured) {
      const newId = appPosts.length > 0 ? Math.max(...appPosts.map(x => x.id)) + 1 : 1;
      appPosts.push({ id: newId, question: q, perspective: p, edit_count: 0, agrees: 0, disagrees: 0, categories: checkedCats });
      save(POSTS_KEY, appPosts);
    } else {
      try {
        postBtn.disabled = true;
        const { data, error } = await supabase
          .from('posts')
          .insert({ question: q, perspective: p, edit_count: 0, agrees: 0, disagrees: 0, categories: checkedCats })
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
    const adminRadios = document.querySelectorAll('#adminCategoryCheckboxes input[type="radio"]');
    adminRadios.forEach((radio, idx) => {
      radio.checked = (idx === 0);
    });

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


// ---- Expand/Collapse Comments Feed ----
function setCommentsExpanded(entryId, show) {
  const body = document.getElementById(`commentsBody-${entryId}`);
  const btn = document.querySelector(`.btn-view-comments[data-entry-id="${entryId}"]`);
  const section = body ? body.closest('.comments-section') : null;
  
  if (!body || !section) return;

  if (show) {
    section.style.display = 'block';
    // Force reflow for height transition animations
    section.offsetHeight;
    body.classList.add('open');
    if (btn) btn.classList.add('open');
  } else {
    body.classList.remove('open');
    if (btn) btn.classList.remove('open');
    setTimeout(() => {
      // Only hide if the user hasn't opened it again in the meantime
      if (!body.classList.contains('open')) {
        section.style.display = 'none';
      }
    }, 400); // 400ms matches max-height transition duration in styles.css
  }
}

// ---- Attach Dynamic DOM Event Listeners ----
function attachEventListeners() {
  // Cup Click — Open Spilled View directly (no top-down view or Zoom)
  document.querySelectorAll('.cup-container').forEach(cup => {
    if (cup.dataset.cupListenerAttached) return;
    cup.dataset.cupListenerAttached = 'true';
    
    const teacup = cup.querySelector('.teacup');
    if (!teacup) return;
    
    teacup.addEventListener('click', (e) => {
      if (cup.classList.contains('spilled')) return;
      e.stopPropagation();
      
      cup.classList.add('spilled');
      const entryId = cup.dataset.entryId;
      history.pushState({ post: entryId }, '', `?post=${entryId}`);
      triggerPostView(entryId);
    });
  });

  // Close Spilled View
  document.querySelectorAll('.btn-close-spill').forEach(btn => {
    if (btn.dataset.closeListenerAttached) return;
    btn.dataset.closeListenerAttached = 'true';
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cup = btn.closest('.cup-container');
      if (!cup) return;
      
      cup.classList.remove('spilled');
      
      if (history.state && history.state.post) {
        history.back();
      } else {
        history.pushState(null, '', window.location.pathname);
      }
    });
  });

  
  // Share button click handler (Triggers native share, falls back to copy link)
  document.querySelectorAll('.btn-share-link').forEach(btn => {
    if (btn.dataset.shareListenerAttached) return;
    btn.dataset.shareListenerAttached = 'true';
    
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const shareUrl = `${window.location.origin}${window.location.pathname}?post=${entryId}`;
      const shareTitle = "PerspecTEAve";
      const shareText = "Check out this take on PerspecTEAve!";

      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl
          });
        } catch (err) {
          console.log('Share canceled or failed:', err);
        }
      } else {
        // Fallback: copy link to clipboard
        try {
          await navigator.clipboard.writeText(shareUrl);
          const statusText = btn.querySelector('.share-status-text');
          const origText = statusText ? statusText.textContent : 'Share';
          btn.classList.add('copied');
          if (statusText) statusText.textContent = 'Copied!';
          setTimeout(() => {
            btn.classList.remove('copied');
            if (statusText) statusText.textContent = origText;
          }, 2000);
        } catch (copyErr) {
          console.error('Clipboard copy failed:', copyErr);
          alert('Could not copy link to clipboard.');
        }
      }
    });
  });


  // Reply submit buttons (Circular checkmark)
  document.querySelectorAll('.btn-reply').forEach(btn => {
    if (btn.dataset.submitListenerAttached) return;
    btn.dataset.submitListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitReply(Number(btn.dataset.entryId));
    });
  });

  // Enter to submit in textareas
  document.querySelectorAll('.reply-text').forEach(ta => {
    if (ta.dataset.keydownListenerAttached) return;
    ta.dataset.keydownListenerAttached = 'true';
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitReply(Number(ta.closest('.reply-form').dataset.entryId));
      }
    });
  });

  // View comments toggle button
  document.querySelectorAll('.btn-view-comments').forEach(btn => {
    if (btn.dataset.toggleListenerAttached) return;
    btn.dataset.toggleListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const body = document.getElementById(`commentsBody-${entryId}`);
      const wasOpen = body ? body.classList.contains('open') : false;
      setCommentsExpanded(entryId, !wasOpen);
    });
  });

  // + Add a comment toggle button inside comments feed
  document.querySelectorAll('.btn-add-inline-comment').forEach(btn => {
    if (btn.dataset.toggleAttached) return;
    btn.dataset.toggleAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const area = document.getElementById(`inlineCommentArea-${entryId}`);
      if (!area) return;
      const form = area.querySelector('.inline-comment-form');
      if (!form) return;
      const isOpen = form.style.display !== 'none';
      if (isOpen) {
        form.style.display = 'none';
        btn.classList.remove('active');
      } else {
        form.style.display = 'block';
        btn.classList.add('active');
        setTimeout(() => {
          const ta = form.querySelector('.comment-text');
          if (ta) ta.focus();
        }, 50);
      }
    });
  });

  // Inline comment submit button
  document.querySelectorAll('.btn-comment-submit').forEach(btn => {
    if (btn.dataset.submitListenerAttached) return;
    btn.dataset.submitListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      submitComment(Number(btn.dataset.entryId));
    });
  });

  // Enter to submit in inline comment textarea
  document.querySelectorAll('.comment-text').forEach(ta => {
    if (ta.dataset.keydownListenerAttached) return;
    ta.dataset.keydownListenerAttached = 'true';
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = ta.closest('.inline-comment-form');
        if (form) {
          submitComment(Number(form.dataset.entryId));
        }
      }
    });
  });

  // Vote buttons click handlers
  document.querySelectorAll('.btn-agree').forEach(btn => {
    if (btn.dataset.voteListenerAttached) return;
    btn.dataset.voteListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      toggleVote(entryId, 'agree');
    });
  });

  document.querySelectorAll('.btn-disagree').forEach(btn => {
    if (btn.dataset.voteListenerAttached) return;
    btn.dataset.voteListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      toggleVote(entryId, 'disagree');
    });
  });

  // --- Admin Post Actions Event Handlers ---
  document.querySelectorAll('.btn-entry-edit').forEach(btn => {
    if (btn.dataset.editListenerAttached) return;
    btn.dataset.editListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      document.getElementById(`entryStatic-${entryId}`).style.display = 'none';
      document.getElementById(`entryEdit-${entryId}`).style.display = 'flex';
    });
  });

  document.querySelectorAll('.btn-edit-cancel').forEach(btn => {
    if (btn.dataset.cancelListenerAttached) return;
    btn.dataset.cancelListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      document.getElementById(`entryStatic-${entryId}`).style.display = 'block';
      document.getElementById(`entryEdit-${entryId}`).style.display = 'none';
    });
  });

  document.querySelectorAll('.btn-edit-save').forEach(btn => {
    if (btn.dataset.saveListenerAttached) return;
    btn.dataset.saveListenerAttached = 'true';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const entryId = Number(btn.dataset.entryId);
      await savePostEdit(entryId);
    });
  });

  document.querySelectorAll('.btn-entry-delete').forEach(btn => {
    if (btn.dataset.deleteListenerAttached) return;
    btn.dataset.deleteListenerAttached = 'true';
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
        if (globalOpenAuthModal) {
          globalOpenAuthModal('signin', 'Sign in to continue');
        } else {
          const loginOverlay = document.getElementById('loginOverlay');
          if (loginOverlay) loginOverlay.classList.add('open');
        }
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
          const c = appComments[postId].find(x => Number(x.id) === Number(commentId));
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
            let verText = versions[currentIndex];
            const vMatch = typeof verText === 'string' && verText.match(/^\[reply_to:\d+\]\s*([\s\S]*)$/);
            if (vMatch) {
              verText = vMatch[1];
            }
            commentTextEl.textContent = verText;
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
          const c = appComments[postId].find(x => Number(x.id) === Number(commentId));
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
            let verText = versions[currentIndex];
            const vMatch = typeof verText === 'string' && verText.match(/^\[reply_to:\d+\]\s*([\s\S]*)$/);
            if (vMatch) {
              verText = vMatch[1];
            }
            commentTextEl.textContent = verText;
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

      // 6. Critique Reply trigger button clicked
      if (e.target.classList.contains('btn-comment-reply-trigger')) {
        e.stopPropagation();
        // No guest login check required to reply

        const commentId = Number(e.target.dataset.commentId);
        const replyId = e.target.dataset.replyId;
        const replyToAuthor = e.target.dataset.replyToAuthor;
        const replyForm = document.getElementById(`replyToCommentForm-${commentId}`);
        if (replyForm) {
          const textarea = replyForm.querySelector('.reply-to-comment-text');
          const isHidden = replyForm.style.display === 'none';
          const activeReplyId = replyForm.dataset.activeReplyId;
          
          if (!isHidden && activeReplyId === replyId) {
            // Clicked the exact same reply button again: close it
            replyForm.style.display = 'none';
            replyForm.removeAttribute('data-active-reply-id');
          } else {
            // Open it or switch target
            replyForm.style.display = 'block';
            replyForm.dataset.activeReplyId = replyId;
            if (textarea) {
              if (replyToAuthor) {
                textarea.value = `@${replyToAuthor} `;
              } else {
                textarea.value = '';
              }
              textarea.focus();
            }
          }
        }
      }

      // 7. Nested reply Submit button clicked
      if (e.target.closest('.btn-reply-to-comment')) {
        e.stopPropagation();
        const btn = e.target.closest('.btn-reply-to-comment');
        const entryId = Number(btn.dataset.entryId);
        const parentId = Number(btn.dataset.parentId);
        await submitCommentReply(entryId, parentId);
      }

      // 7.5. Critique Reply Cancel button clicked
      if (e.target.classList.contains('btn-comment-reply-cancel')) {
        e.stopPropagation();
        const commentId = Number(e.target.dataset.commentId);
        const replyForm = document.getElementById(`replyToCommentForm-${commentId}`);
        if (replyForm) {
          replyForm.style.display = 'none';
          replyForm.removeAttribute('data-active-reply-id');
          const textarea = replyForm.querySelector('.reply-to-comment-text');
          if (textarea) textarea.value = '';
          const nameInput = replyForm.querySelector('.reply-to-comment-name');
          if (nameInput) nameInput.value = '';
        }
      }

      // 8. Admin Delete Comment button clicked
      if (e.target.classList.contains('btn-comment-delete')) {
        e.stopPropagation();
        const commentId = Number(e.target.dataset.commentId);
        const entryId = Number(e.target.dataset.entryId);
        if (confirm('Are you sure you want to delete this comment?')) {
          await deleteComment(entryId, commentId);
        }
      }

      // 9. Admin Hide/Unhide Comment button clicked
      if (e.target.classList.contains('btn-comment-hide')) {
        e.stopPropagation();
        const commentId = Number(e.target.dataset.commentId);
        const entryId = Number(e.target.dataset.entryId);
        await toggleHideComment(entryId, commentId);
      }
    });
  }

  // Keydown listener on entriesList for reply forms (press Enter to submit)
  if (entriesList && !entriesList.dataset.keydownListenersAttached) {
    entriesList.dataset.keydownListenersAttached = 'true';
    entriesList.addEventListener('keydown', async (e) => {
      if (e.target.classList.contains('reply-to-comment-text') && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const form = e.target.closest('.reply-to-comment-form');
        const entryId = Number(form.dataset.entryId);
        const parentId = Number(form.dataset.parentId);
        await submitCommentReply(entryId, parentId);
      }
    });
  }

  // Read more buttons click handlers
  document.querySelectorAll('.btn-read-more').forEach(btn => {
    if (btn.dataset.readMoreListenerAttached) return;
    btn.dataset.readMoreListenerAttached = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const truncatedSpan = document.getElementById(`perspectiveTruncated-${entryId}`);
      const fullSpan = document.getElementById(`perspectiveFull-${entryId}`);
      if (truncatedSpan && fullSpan) {
        truncatedSpan.style.display = 'none';
        fullSpan.style.display = 'inline';
      }
    });
  });
}


// ---- Topic Requests logic ----
let appRequests = [];
const REQUESTS_KEY = 'perspecteave_topic_requests';
const READ_REQUESTS_KEY = 'perspecteave_read_requests';
let readRequestIds = JSON.parse(localStorage.getItem(READ_REQUESTS_KEY) || '[]');
let activeRequestDetailId = null;
let userShowingForm = false;
let myRequestIds = JSON.parse(localStorage.getItem('perspecteave_my_requests') || '[]');

function parseReply(req) {
  if (!req || !req.question) return { isReply: false };
  const match = req.question.match(/^\[reply_to:(\d+)\]\s*([\s\S]*)$/);
  if (match) {
    return { isReply: true, parentId: Number(match[1]), text: match[2] };
  }
  return { isReply: false };
}

function getLastMessageInThread(parentId) {
  const parent = appRequests.find(r => Number(r.id) === Number(parentId));
  if (!parent) return null;
  
  const replies = appRequests.filter(r => {
    const p = parseReply(r);
    return p.isReply && p.parentId === parentId;
  });
  
  if (replies.length === 0) {
    return {
      id: parent.id,
      name: parent.name,
      text: parent.question,
      created_at: parent.created_at
    };
  }
  
  replies.sort((a, b) => a.id - b.id);
  const lastReply = replies[replies.length - 1];
  const parsed = parseReply(lastReply);
  return {
    id: lastReply.id,
    name: lastReply.name,
    text: parsed.text,
    created_at: lastReply.created_at
  };
}

function formatBubbleTime(dateStr) {
  if (!dateStr) return 'Just now';
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

async function loadTopicRequests() {
  if (isConfigured) {
    try {
      const { data, error } = await supabase
        .from('topic_requests')
        .select('*')
        .order('id', { ascending: false });
      if (error) throw error;
      if (data) {
        appRequests = data;
        
        // Auto-clean up orphaned replies from the database if logged in as admin
        if (isAdmin(currentSession)) {
          const parentIds = new Set(data.filter(r => !parseReply(r).isReply).map(r => Number(r.id)));
          const orphans = data.filter(r => {
            const parsed = parseReply(r);
            return parsed.isReply && !parentIds.has(Number(parsed.parentId));
          });
          
          if (orphans.length > 0) {
            const orphanIds = orphans.map(o => o.id);
            console.log('Auto-cleaning orphaned replies:', orphanIds);
            supabase.from('topic_requests').delete().in('id', orphanIds).then(({ error: delErr }) => {
              if (delErr) console.warn('Orphan cleanup error:', delErr);
            });
            appRequests = appRequests.filter(r => !orphanIds.includes(r.id));
          }
        }
        
        updateMessagesBadge();
        updateUserMessagesBadge();
        return;
      }
    } catch (err) {
      console.error('Could not load from topic_requests table:', err);
    }
  }
  appRequests = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
  updateMessagesBadge();
  updateUserMessagesBadge();
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
    const guestNum = currentGuestNumber || 1;
    const suffix = `(Guest ${guestNum})`;
    if (!name.includes(suffix)) {
      name = `${name} ${suffix}`;
    }
    localStorage.setItem('perspecteave_last_guest_name', name);
    updateCommentForms(currentSession);
  }
  
  btn.disabled = true;
  
  if (isConfigured) {
    try {
      const { data, error } = await supabase
        .from('topic_requests')
        .insert({ name, question })
        .select('*')
        .single();
      if (error) throw error;

      if (name !== 'teaboy27') {
        sendPushNotification(
          `New Suggestion from ${name}`,
          `"${question.substring(0, 60)}${question.length > 60 ? '...' : ''}"`
        );
      }
      
      if (data) {
        myRequestIds.push(data.id);
        localStorage.setItem('perspecteave_my_requests', JSON.stringify(myRequestIds));
      }
      
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
      renderUserRequests(); // Render user's updated requests list/detail
      return;
    } catch (err) {
      console.error('Could not insert to Supabase topic_requests:', err);
      alert('Error submitting request to database: ' + (err.message || err));
      btn.disabled = false;
      return;
    }
  }
  
  const newRequest = {
    id: Date.now(),
    name,
    question,
    created_at: new Date().toISOString()
  };
  
  myRequestIds.push(newRequest.id);
  localStorage.setItem('perspecteave_my_requests', JSON.stringify(myRequestIds));
  
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
  renderUserRequests(); // Render user's updated requests list/detail
}

async function submitChatReply(parentRequestId, isFromAdmin) {
  const dropdownId = isFromAdmin ? 'adminMessagesDropdown' : 'requestDropdown';
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;

  const replyInput = dropdown.querySelector('.chat-input-textarea');
  if (!replyInput) return;
  const text = replyInput.value.trim();
  if (!text) return;
  
  replyInput.disabled = true;
  const sendBtn = dropdown.querySelector('.btn-chat-send');
  if (sendBtn) sendBtn.disabled = true;

  const parent = appRequests.find(r => Number(r.id) === Number(parentRequestId));
  if (!parent) {
    replyInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    return;
  }

  const name = isFromAdmin ? 'teaboy27' : (parent.name || 'Anonymous');
  const question = `[reply_to:${parentRequestId}] ${text}`;

  if (isConfigured) {
    try {
      const { data, error } = await supabase
        .from('topic_requests')
        .insert({ name, question })
        .select('*')
        .single();
      if (error) throw error;

      if (!isFromAdmin) {
        sendPushNotification(
          `New Reply from ${name}`,
          `"${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`
        );
      }
      
      await loadTopicRequests();
    } catch (err) {
      console.error('Could not submit reply to Supabase:', err);
      alert('Error sending message: ' + (err.message || err));
      replyInput.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }
  } else {
    const newReply = {
      id: Date.now(),
      name,
      question,
      created_at: new Date().toISOString()
    };
    appRequests.push(newReply);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(appRequests));
  }

  replyInput.value = '';
  replyInput.disabled = false;
  if (sendBtn) sendBtn.disabled = false;

  // Mark this reply as read immediately for the sender
  const lastReply = appRequests.find(r => {
    const p = parseReply(r);
    return p.isReply && Number(p.parentId) === Number(parentRequestId) && r.name === name && !readRequestIds.map(String).includes(String(r.id));
  });
  if (lastReply) {
    readRequestIds.push(lastReply.id);
    localStorage.setItem(READ_REQUESTS_KEY, JSON.stringify(readRequestIds));
  }

  if (isFromAdmin) {
    renderAdminRequests();
  } else {
    renderUserRequests();
  }

  // Scroll to bottom
  const container = document.getElementById('chatBubbleContainer');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

async function dismissRequest(requestId) {
  // Clean up read status
  readRequestIds = readRequestIds.filter(id => id !== requestId);
  localStorage.setItem(READ_REQUESTS_KEY, JSON.stringify(readRequestIds));

  if (isConfigured) {
    try {
      await Promise.all([
        supabase.from('topic_requests').delete().eq('id', requestId),
        supabase.from('topic_requests').delete().like('question', `[reply_to:${requestId}]%`)
      ]);
      await loadTopicRequests();
      renderAdminRequests();
      renderUserRequests();
      return;
    } catch (err) {
      console.warn('Could not delete from Supabase topic_requests:', err);
    }
  }
  
  appRequests = appRequests.filter(r => {
    if (Number(r.id) === Number(requestId)) return false;
    const parsed = parseReply(r);
    return !(parsed.isReply && Number(parsed.parentId) === Number(requestId));
  });
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(appRequests));
  renderAdminRequests();
  renderUserRequests();
}

function startTakeFromRequest(question) {
  const adminQuestionInput = document.getElementById('adminQuestion');
  if (adminQuestionInput) {
    adminQuestionInput.value = question;
    adminQuestionInput.focus();
    
    // Open admin panel if closed
    const panel = document.getElementById('adminPanel');
    const wasClosed = panel && !panel.classList.contains('open');
    if (wasClosed) {
      panel.classList.add('open');
    }
    
    if (wasClosed) {
      setTimeout(() => {
        adminQuestionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } else {
      adminQuestionInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Close messages dropdown if open
  const adminMessagesDropdown = document.getElementById('adminMessagesDropdown');
  if (adminMessagesDropdown) adminMessagesDropdown.classList.remove('open');
  const adminMessagesBtn = document.getElementById('adminMessagesBtn');
  if (adminMessagesBtn) adminMessagesBtn.classList.remove('active');
}

function updateMessagesBadge() {
  const badge = document.getElementById('adminMessagesBadge');
  if (!badge) return;
  
  // Calculate unread requests (exclude admin's own replies and orphaned replies)
  const unreadCount = appRequests.filter(req => {
    if (req.name === 'teaboy27') return false;
    if (readRequestIds.map(String).includes(String(req.id))) return false;
    
    const parsed = parseReply(req);
    if (parsed.isReply) {
      // It's a reply; verify the parent thread exists
      const parentExists = appRequests.some(r => Number(r.id) === Number(parsed.parentId));
      if (!parentExists) return false;
    }
    return true;
  }).length;
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function updateUserMessagesBadge() {
  const badge = document.getElementById('userMessagesBadge');
  if (!badge) return;
  
  const loggedIn = isLoggedIn(currentSession);
  const username = loggedIn ? getCurrentUsername(currentSession) : '';
  const myIds = myRequestIds.map(Number);

  // Count unread replies from 'teaboy27' that belong to user's threads
  const unreadCount = appRequests.filter(req => {
    if (req.name !== 'teaboy27') return false;
    if (readRequestIds.map(String).includes(String(req.id))) return false;
    const parsed = parseReply(req);
    if (!parsed.isReply) return false;
    
    // Find the parent request
    const parent = appRequests.find(r => Number(r.id) === Number(parsed.parentId));
    if (!parent) return false;
    
    if (myIds.includes(Number(parent.id))) return true;
    if (loggedIn && username && parent.name === username) return true;
    return false;
  }).length;
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderAdminRequests() {
  const dropdown = document.getElementById('adminMessagesDropdown');
  if (!dropdown) return;
  
  const threads = appRequests.filter(req => !parseReply(req).isReply);
  
  if (threads.length === 0) {
    dropdown.innerHTML = `
      <h3 class="admin-requests-title">Messages <span id="adminVisitorCount" style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted); margin-left: 6px;"></span></h3>
      <div style="font-family: var(--font-body); font-size: 0.88rem; color: var(--text-muted); padding: var(--space-md); text-align: center;">No messages yet.</div>
    `;
    updateMessagesBadge();
    fetchUniqueVisitorsCount().then(count => {
      const el = document.getElementById('adminVisitorCount');
      if (el && count !== null) {
        el.textContent = ` (${count} unique visitors)`;
      }
    });
    return;
  }
  
  if (activeRequestDetailId === null) {
    // ---- Render List (Inbox) View ----
    let threadsHTML = threads.map(req => {
      const lastMsg = getLastMessageInThread(req.id) || { name: req.name, text: req.question, created_at: req.created_at };
      const timeStr = lastMsg.created_at ? formatBubbleTime(lastMsg.created_at) : 'Just now';
      
      const hasUnread = appRequests.some(r => {
        if (Number(r.id) === Number(req.id)) {
          return r.name !== 'teaboy27' && !readRequestIds.map(String).includes(String(r.id));
        }
        const parsed = parseReply(r);
        return parsed.isReply && Number(parsed.parentId) === Number(req.id) && r.name !== 'teaboy27' && !readRequestIds.map(String).includes(String(r.id));
      });
      
      const snippet = lastMsg.text.length > 30 ? lastMsg.text.substring(0, 30) + '...' : lastMsg.text;
      const initial = req.name ? (formatDisplayName(req.name).trim().charAt(0) || 'A').toUpperCase() : 'A';
      return `
        <li class="admin-message-thread" data-request-id="${req.id}">
          <div class="message-thread-avatar">${escapeHTML(initial)}</div>
          <div class="message-thread-info">
            <div class="message-thread-header">
              <span class="message-thread-sender">${escapeHTML(formatDisplayName(req.name) || 'Anonymous')}</span>
              <span class="message-thread-time">${escapeHTML(timeStr)}</span>
            </div>
            <div class="message-thread-snippet">${escapeHTML(snippet)}</div>
          </div>
          ${hasUnread ? '<span class="message-unread-dot"></span>' : ''}
        </li>
      `;
    }).join('');
    
    dropdown.innerHTML = `
      <h3 class="admin-requests-title">Messages <span id="adminVisitorCount" style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted); margin-left: 6px;"></span></h3>
      <ul class="admin-requests-list" style="margin: 0; padding: 0;">
        ${threadsHTML}
      </ul>
    `;
    
    fetchUniqueVisitorsCount().then(count => {
      const el = document.getElementById('adminVisitorCount');
      if (el && count !== null) {
        el.textContent = ` (${count} unique visitors)`;
      }
    });
    
    // Wire up thread click listeners
    dropdown.querySelectorAll('.admin-message-thread').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const reqId = Number(item.dataset.requestId);
        
        // Find all replies in this thread
        const replies = appRequests.filter(r => {
          const parsed = parseReply(r);
          return parsed.isReply && parsed.parentId === reqId;
        });
        
        // Mark parent and all replies from users as read
        const threadMsgs = [
          appRequests.find(r => Number(r.id) === Number(reqId)),
          ...replies
        ].filter(Boolean);
        
        let changed = false;
        threadMsgs.forEach(msg => {
          if (msg.name !== 'teaboy27' && !readRequestIds.map(String).includes(String(msg.id))) {
            readRequestIds.push(msg.id);
            changed = true;
          }
        });
        
        if (changed) {
          localStorage.setItem(READ_REQUESTS_KEY, JSON.stringify(readRequestIds));
          updateMessagesBadge();
        }
        
        activeRequestDetailId = reqId;
        renderAdminRequests();
      });
    });
    
  } else {
    // ---- Render Detail View ----
    const req = appRequests.find(r => Number(r.id) === Number(activeRequestDetailId));
    if (!req) {
      activeRequestDetailId = null;
      renderAdminRequests();
      return;
    }
    
    const replies = appRequests.filter(r => {
      const p = parseReply(r);
      return p.isReply && Number(p.parentId) === Number(activeRequestDetailId);
    });
    
    const messages = [req, ...replies].sort((a, b) => a.id - b.id);
    
    // Mark parent and replies in this thread as read immediately for the admin
    let changed = false;
    messages.forEach(msg => {
      if (msg.name !== 'teaboy27' && !readRequestIds.map(String).includes(String(msg.id))) {
        readRequestIds.push(msg.id);
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem(READ_REQUESTS_KEY, JSON.stringify(readRequestIds));
      updateMessagesBadge();
    }
    
    const bubblesHTML = messages.map(msg => {
      const isAuthor = msg.name === 'teaboy27';
      const parsed = parseReply(msg);
      const text = parsed.isReply ? parsed.text : msg.question;
      const bubbleClass = isAuthor ? 'bubble-sent' : 'bubble-received';
      const msgTime = formatBubbleTime(msg.created_at);
      return `
        <div class="chat-message-bubble ${bubbleClass}">
          <div>${escapeHTML(text)}</div>
          <span class="bubble-time">${escapeHTML(msgTime)}</span>
        </div>
      `;
    }).join('');
    
    dropdown.innerHTML = `
      <div class="message-detail-header" style="margin-bottom: var(--space-xs); padding-bottom: var(--space-xs);">
        <button type="button" class="btn-message-back" id="btnMessageBack" title="Back to inbox">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <span style="flex: 1; font-size: 0.95rem;">${escapeHTML(formatDisplayName(req.name) || 'Anonymous')}</span>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="btn-request-action btn-request-write" data-question="${escapeHTML(req.question)}" title="Write Take" style="padding: 4px 8px; font-size: 0.75rem;">Write</button>
          <button type="button" class="btn-request-action btn-request-dismiss" data-request-id="${req.id}" title="Dismiss" style="padding: 4px 8px; font-size: 0.75rem;">Dismiss</button>
        </div>
      </div>
      <div class="chat-messages-container" id="chatBubbleContainer" style="max-height: 220px; overflow-y: auto; padding: var(--space-sm); display: flex; flex-direction: column; gap: var(--space-xs);">
        ${bubblesHTML}
      </div>
      <div class="chat-input-area" style="display: flex; gap: var(--space-xs); padding: var(--space-sm); border-top: 1px solid var(--border-light); margin-top: 4px;">
        <textarea class="chat-input-textarea" id="chatReplyText" placeholder="Type a message..." rows="1" style="flex: 1; resize: none; border-radius: 16px; border: 1px solid var(--border-light); padding: 6px 12px; font-family: var(--font-body); font-size: 0.82rem; outline: none;"></textarea>
        <button class="btn-chat-send" id="btnChatSend" style="background: var(--accent-matcha); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
    
    // Wire up back button
    const backBtn = dropdown.querySelector('#btnMessageBack');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeRequestDetailId = null;
        renderAdminRequests();
      });
    }
    
    // Wire up Write Take
    const writeBtn = dropdown.querySelector('.btn-request-write');
    if (writeBtn) {
      writeBtn.addEventListener('click', (e) => {
        const q = e.target.dataset.question;
        startTakeFromRequest(q);
      });
    }
    
    // Wire up Dismiss
    const dismissBtn = dropdown.querySelector('.btn-request-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', async (e) => {
        const reqId = Number(e.target.dataset.requestId);
        if (confirm('Are you sure you want to dismiss this request?')) {
          await dismissRequest(reqId);
          activeRequestDetailId = null; // Go back to inbox after dismissing
          renderAdminRequests();
        }
      });
    }

    // Wire up Send Button
    const sendBtn = dropdown.querySelector('#btnChatSend');
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        submitChatReply(activeRequestDetailId, true);
      });
    }

    // Wire up Textarea Enter
    const replyInput = dropdown.querySelector('#chatReplyText');
    if (replyInput) {
      replyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitChatReply(activeRequestDetailId, true);
        }
      });
    }

    // Scroll to bottom
    const container = dropdown.querySelector('#chatBubbleContainer');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }
  
  updateMessagesBadge();
}

function renderUserRequests() {
  const dropdown = document.getElementById('requestDropdown');
  if (!dropdown) return;

  const loggedIn = isLoggedIn(currentSession);
  const username = loggedIn ? getCurrentUsername(currentSession) : '';
  const myIds = myRequestIds.map(Number);

  const userThreads = appRequests.filter(req => {
    if (parseReply(req).isReply) return false;
    if (myIds.includes(Number(req.id))) return true;
    if (loggedIn && username && req.name === username) return true;
    return false;
  });

  // If the user has exactly 1 thread, auto-open it directly instead of showing a list
  if (userThreads.length === 1 && activeRequestDetailId === null && !userShowingForm) {
    activeRequestDetailId = userThreads[0].id;
  }

  // Determine whether to show the form or threads list
  if (userThreads.length === 0 || userShowingForm) {
    // ---- Render Submission Form ----
    dropdown.innerHTML = `
      <h3 class="admin-requests-title" style="padding-left: var(--space-sm);">Suggestions</h3>
      <form class="login-form" id="requestForm" onsubmit="return false;" style="display: flex; flex-direction: column; gap: var(--space-sm); padding: var(--space-sm); margin: 0;">
        ${!loggedIn ? `
          <input type="text" id="requestName" placeholder="Your name" required style="border-radius: 8px; border: 1px solid var(--border-light); padding: 8px 12px; font-family: var(--font-body); font-size: 0.88rem; outline: none; background: var(--bg-card); color: var(--text-primary);">
        ` : ''}
        <textarea id="requestQuestionText" placeholder="Suggest topic or ask a question..." rows="3" required style="border-radius: 8px; border: 1px solid var(--border-light); padding: 8px 12px; font-family: var(--font-body); font-size: 0.88rem; outline: none; resize: vertical; background: var(--bg-card); color: var(--text-primary);"></textarea>
        <button type="button" class="btn-login-submit" id="requestSubmitBtn" style="border-radius: 8px; padding: 8px var(--space-md); font-weight: 600; width: 100%;">Submit</button>
      </form>
      ${userThreads.length > 0 ? `
        <div style="text-align: center; margin-top: -4px; padding-bottom: var(--space-sm);">
          <a href="#" id="btnBackToMessages" style="font-family: var(--font-body); font-size: 0.78rem; color: var(--accent-tea); text-decoration: none; font-weight: 600;">View my messages</a>
        </div>
      ` : ''}
    `;

    // Wire up submit button
    const submitBtn = dropdown.querySelector('#requestSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        submitTopicRequest();
      });
    }

    // Wire up textarea keydown (Enter to submit)
    const textarea = dropdown.querySelector('#requestQuestionText');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitTopicRequest();
        }
      });
    }

    // Wire up back to messages link
    const backToMsgsBtn = dropdown.querySelector('#btnBackToMessages');
    if (backToMsgsBtn) {
      backToMsgsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        userShowingForm = false;
        renderUserRequests();
      });
    }

  } else if (activeRequestDetailId === null) {
    // ---- Render Threads List View ----
    let threadsHTML = userThreads.map(req => {
      const lastMsg = getLastMessageInThread(req.id) || { name: req.name, text: req.question, created_at: req.created_at };
      const timeStr = lastMsg.created_at ? formatBubbleTime(lastMsg.created_at) : 'Just now';
      
      const hasUnread = appRequests.some(r => {
        if (Number(r.id) === Number(req.id)) {
          return r.name === 'teaboy27' && !readRequestIds.map(String).includes(String(r.id));
        }
        const parsed = parseReply(r);
        return parsed.isReply && Number(parsed.parentId) === Number(req.id) && r.name === 'teaboy27' && !readRequestIds.map(String).includes(String(r.id));
      });
      
      const isLastMsgFromAdmin = lastMsg.name === 'teaboy27';
      const prefix = isLastMsgFromAdmin ? '' : 'You: ';
      const snippet = prefix + (lastMsg.text.length > 25 ? lastMsg.text.substring(0, 25) + '...' : lastMsg.text);
      
      return `
        <li class="admin-message-thread user-message-thread" data-request-id="${req.id}">
          <div class="message-thread-avatar" style="background: rgba(74, 117, 89, 0.1); color: var(--accent-matcha); font-weight: bold;">A</div>
          <div class="message-thread-info">
            <div class="message-thread-header">
              <span class="message-thread-sender">Adithyan (Author)</span>
              <span class="message-thread-time">${escapeHTML(timeStr)}</span>
            </div>
            <div class="message-thread-snippet">${escapeHTML(snippet)}</div>
          </div>
          ${hasUnread ? '<span class="message-unread-dot"></span>' : ''}
        </li>
      `;
    }).join('');

    dropdown.innerHTML = `
      <h3 class="admin-requests-title" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
        <span>My Messages</span>
        <button type="button" id="btnAskNewQuestion" style="background: none; border: none; color: var(--accent-tea); font-family: var(--font-body); font-size: 0.78rem; font-weight: 600; cursor: pointer; padding: 0;">+ Ask New</button>
      </h3>
      <ul class="admin-requests-list" style="margin: 0; padding: 0; max-height: 250px; overflow-y: auto;">
        ${threadsHTML}
      </ul>
    `;

    // Wire up Ask New button
    const askNewBtn = dropdown.querySelector('#btnAskNewQuestion');
    if (askNewBtn) {
      askNewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userShowingForm = true;
        renderUserRequests();
      });
    }

    // Wire up thread click listeners
    dropdown.querySelectorAll('.user-message-thread').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const reqId = Number(item.dataset.requestId);
        
        // Mark all replies from author as read
        const replies = appRequests.filter(r => {
          const parsed = parseReply(r);
          return parsed.isReply && parsed.parentId === reqId;
        });
        
        const threadMsgs = [
          appRequests.find(r => Number(r.id) === Number(reqId)),
          ...replies
        ].filter(Boolean);
        
        let changed = false;
        threadMsgs.forEach(msg => {
          if (msg.name === 'teaboy27' && !readRequestIds.map(String).includes(String(msg.id))) {
            readRequestIds.push(msg.id);
            changed = true;
          }
        });
        
        if (changed) {
          localStorage.setItem(READ_REQUESTS_KEY, JSON.stringify(readRequestIds));
          updateUserMessagesBadge();
        }
        
        activeRequestDetailId = reqId;
        renderUserRequests();
      });
    });

  } else {
    // ---- Render User Detail View (Chat Bubbles) ----
    const req = appRequests.find(r => Number(r.id) === Number(activeRequestDetailId));
    if (!req) {
      activeRequestDetailId = null;
      renderUserRequests();
      return;
    }
    
    const replies = appRequests.filter(r => {
      const p = parseReply(r);
      return p.isReply && Number(p.parentId) === Number(activeRequestDetailId);
    });
    
    const messages = [req, ...replies].sort((a, b) => a.id - b.id);
    
    // Mark parent and replies in this thread as read immediately for the user
    let changed = false;
    messages.forEach(msg => {
      if (msg.name === 'teaboy27' && !readRequestIds.map(String).includes(String(msg.id))) {
        readRequestIds.push(msg.id);
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem(READ_REQUESTS_KEY, JSON.stringify(readRequestIds));
      updateUserMessagesBadge();
    }
    
    const bubblesHTML = messages.map(msg => {
      const isAuthor = msg.name === 'teaboy27';
      const parsed = parseReply(msg);
      const text = parsed.isReply ? parsed.text : msg.question;
      const bubbleClass = isAuthor ? 'bubble-received' : 'bubble-sent';
      const msgTime = formatBubbleTime(msg.created_at);
      return `
        <div class="chat-message-bubble ${bubbleClass}">
          <div>${escapeHTML(text)}</div>
          <span class="bubble-time">${escapeHTML(msgTime)}</span>
        </div>
      `;
    }).join('');

    const showBackBtn = userThreads.length > 1;

    dropdown.innerHTML = `
      <div class="message-detail-header" style="margin-bottom: var(--space-xs); padding-bottom: var(--space-xs); display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center;">
          ${showBackBtn ? `
            <button type="button" class="btn-message-back" id="btnUserMessageBack" title="Back to messages">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
          ` : ''}
          <span style="font-size: 0.95rem; font-weight: 600; ${showBackBtn ? 'margin-left: var(--space-xs);' : ''}">Adithyan (Author)</span>
        </div>
        <button type="button" id="btnUserAskNew" style="background: none; border: none; color: var(--accent-tea); font-family: var(--font-body); font-size: 0.78rem; font-weight: 600; cursor: pointer; padding: 0;">+ Ask New</button>
      </div>
      <div class="chat-messages-container" id="chatBubbleContainer" style="max-height: 220px; overflow-y: auto; padding: var(--space-sm); display: flex; flex-direction: column; gap: var(--space-xs);">
        ${bubblesHTML}
      </div>
      <div class="chat-input-area" style="display: flex; gap: var(--space-xs); padding: var(--space-sm); border-top: 1px solid var(--border-light); margin-top: 4px;">
        <textarea class="chat-input-textarea" id="chatReplyText" placeholder="Type a message..." rows="1" style="flex: 1; resize: none; border-radius: 16px; border: 1px solid var(--border-light); padding: 6px 12px; font-family: var(--font-body); font-size: 0.82rem; outline: none; background: var(--bg-card); color: var(--text-primary);"></textarea>
        <button class="btn-chat-send" id="btnChatSend" style="background: var(--accent-matcha); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;

    // Wire up back button
    if (showBackBtn) {
      const backBtn = dropdown.querySelector('#btnUserMessageBack');
      if (backBtn) {
        backBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          activeRequestDetailId = null;
          renderUserRequests();
        });
      }
    }

    // Wire up Ask New button
    const userAskNewBtn = dropdown.querySelector('#btnUserAskNew');
    if (userAskNewBtn) {
      userAskNewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userShowingForm = true;
        activeRequestDetailId = null;
        renderUserRequests();
      });
    }

    // Wire up Send Button
    const sendBtn = dropdown.querySelector('#btnChatSend');
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        submitChatReply(activeRequestDetailId, false);
      });
    }

    // Wire up Textarea Enter
    const replyInput = dropdown.querySelector('#chatReplyText');
    if (replyInput) {
      replyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitChatReply(activeRequestDetailId, false);
        }
      });
    }

    // Scroll to bottom
    const container = dropdown.querySelector('#chatBubbleContainer');
    if (container) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }

  updateUserMessagesBadge();
}

function setupRequestForm() {
  const askAuthorBtn = document.getElementById('askAuthorBtn');
  const requestDropdown = document.getElementById('requestDropdown');
  
  if (askAuthorBtn && requestDropdown) {
    askAuthorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userShowingForm = false;
      activeRequestDetailId = null;
      renderUserRequests();
      requestDropdown.classList.toggle('open');
      askAuthorBtn.classList.toggle('active');
    });

    // Close request dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!document.body.contains(e.target)) return;
      if (requestDropdown.classList.contains('open') && !askAuthorBtn.contains(e.target) && !requestDropdown.contains(e.target)) {
        requestDropdown.classList.remove('open');
        askAuthorBtn.classList.remove('active');
        activeRequestDetailId = null;
        userShowingForm = false;
        renderUserRequests();
      }
    });
  }
}

function setupAdminMessages() {
  const adminMessagesBtn = document.getElementById('adminMessagesBtn');
  const adminMessagesDropdown = document.getElementById('adminMessagesDropdown');
  
  if (adminMessagesBtn && adminMessagesDropdown) {
    adminMessagesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeRequestDetailId = null; // Always open to list view
      renderAdminRequests();
      adminMessagesDropdown.classList.toggle('open');
      adminMessagesBtn.classList.toggle('active');
    });

    // Close messages dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!document.body.contains(e.target)) return;
      if (adminMessagesDropdown.classList.contains('open') && !adminMessagesBtn.contains(e.target) && !adminMessagesDropdown.contains(e.target)) {
        adminMessagesDropdown.classList.remove('open');
        adminMessagesBtn.classList.remove('active');
        activeRequestDetailId = null;
        renderAdminRequests();
      }
    });
  }
}


// ---- Initialization ----
async function init() {

  // Load posts
  appPosts = await fetchPosts();

  // Load post views
  appPostViews = await fetchPostViews();

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

  // Populate admin categories checklist
  const adminCheckboxGrid = document.getElementById('adminCategoryCheckboxes');
  if (adminCheckboxGrid) {
    adminCheckboxGrid.innerHTML = AVAILABLE_THEMES.map((theme, idx) => `
      <label class="category-checkbox-label">
        <input type="radio" name="adminCategory" value="${theme.value}" ${idx === 0 ? 'checked' : ''}>
        <span>${theme.label}</span>
      </label>
    `).join('');
  }

  setupAuth();
  setupTheme();
  setupRequestForm();
  setupAdminMessages();
  setupNotificationsBtn();
  // Realtime notifications are set up via updateAuthUI when admin logs in

  // Trigger initial UI render based on current auth state
  await updateAuthUI(currentSession);

  // Handle shared post deep link
  const urlParams = new URLSearchParams(window.location.search);
  const postIdParam = urlParams.get('post');
  if (postIdParam) {
    const cup = document.querySelector(`.cup-container[data-entry-id="${postIdParam}"]`);
    if (cup) {
      cup.classList.add('spilled');
      triggerPostView(postIdParam);
      setTimeout(() => {
        cup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }

  // Handle popstate for browser back/forward navigation
  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    
    // Close any currently spilled cup overlays
    document.querySelectorAll('.cup-container.spilled').forEach(cup => {
      cup.classList.remove('spilled');
    });

    if (postId) {
      const cup = document.querySelector(`.cup-container[data-entry-id="${postId}"]`);
      if (cup) {
        cup.classList.add('spilled');
        triggerPostView(postId);
      }
    }
  });

  
  // Log page load visit and determine guest number
  logVisit().then(() => {
    determineGuestNumber();
  });

  // Delegated event listener for formatting toolbar buttons (uses mousedown to prevent loss of focus/selection)
  document.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.formatting-toolbar button');
    if (btn) {
      e.preventDefault();
      const toolbar = btn.closest('.formatting-toolbar');
      const textareaId = toolbar.getAttribute('data-textarea-id');
      const textarea = document.getElementById(textareaId);
      if (textarea) {
        let type = 'bold';
        if (btn.classList.contains('btn-italic')) type = 'italic';
        else if (btn.classList.contains('btn-underline')) type = 'underline';
        else if (btn.classList.contains('btn-bullet')) type = 'bullet';
        applyFormatting(textarea, type);
      }
    }
  });

  // PWA Install Button Click Handler
  const pwaBtn = document.getElementById('pwaInstallBtn');
  if (pwaBtn) {
    pwaBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and can't use it again, discard it
      deferredPrompt = null;
      // Hide the install button
      pwaBtn.style.display = 'none';
    });
  }
}

// ============================================
// Realtime Notification System (Author Only)
// ============================================

let adminNotificationChannel = null;

/**
 * Subscribe to Supabase Realtime INSERT events on the notifications table.
 * Called when the admin logs in. Shows a browser notification for each new row.
 */
function subscribeToAdminNotifications() {
  if (!isConfigured || adminNotificationChannel) return;

  adminNotificationChannel = supabase
    .channel('admin-notifications')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      async (payload) => {
        const { title, body } = payload.new;
        if (Notification.permission !== 'granted') return;

        try {
          // Use ServiceWorker showNotification for reliable mobile/PWA support
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification(title, {
            body,
            icon: '/logo.png',
            badge: '/logo.png',
            vibrate: [100, 50, 100],
            tag: 'perspecteave-' + (payload.new.id || Date.now()),
            data: { url: '/' }
          });
        } catch (e) {
          // Fallback to basic Notification API (desktop browsers)
          try {
            new Notification(title, { body, icon: '/logo.png' });
          } catch (e2) {
            console.warn('Could not show notification:', e2);
          }
        }
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] Notification channel:', status);
    });
}

/**
 * Unsubscribe from the Realtime notification channel.
 * Called when the admin logs out or when a non-admin user is detected.
 */
function unsubscribeFromAdminNotifications() {
  if (adminNotificationChannel) {
    supabase.removeChannel(adminNotificationChannel);
    adminNotificationChannel = null;
  }
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BMMdv7F4CsfOFKFeWReqhDG1z-S4CbFYiJpvVTtGmZ6aRTER945-LhFabNsd4U_KVcZsSFCxznFX5LqaR3F3VTY';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Update the notifications toggle button state
async function updateNotificationsBtnUI() {
  const btnText = document.getElementById('notificationsBtnText');
  if (!btnText) return;

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    btnText.textContent = 'Notifications Unsupported';
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) {
      btnText.textContent = 'Push Unsupported';
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      btnText.textContent = 'Notifications On ✓';
    } else {
      btnText.textContent = 'Enable Notifications';
    }
  } catch (err) {
    console.error('Error updating notifications UI:', err);
    btnText.textContent = 'Enable Notifications';
  }
}

// Setup notifications button click handler
function setupNotificationsBtn() {
  const btn = document.getElementById('dropdownNotificationsBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Notifications are not supported on this browser/device.');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.pushManager) {
        alert('Push notifications are not supported on this browser/device.');
        return;
      }

      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        // Unsubscribe
        try {
          await sub.unsubscribe();
          
          // Remove from Supabase
          if (isConfigured) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          }
          
          console.log('Unsubscribed from push notifications.');
          updateNotificationsBtnUI();
          alert('Notifications disabled.');
        } catch (err) {
          console.error('Failed to unsubscribe:', err);
          alert('Failed to disable notifications: ' + err.message);
        }
      } else {
        // Subscribe
        try {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            alert('Notification permission denied.');
            updateNotificationsBtnUI();
            return;
          }

          const newSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });

          // Save to Supabase
          if (isConfigured) {
            const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(newSub.getKey('p256dh'))))
              .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(newSub.getKey('auth'))))
              .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const { error } = await supabase
              .from('push_subscriptions')
              .insert({
                endpoint: newSub.endpoint,
                p256dh,
                auth,
                user_id: 'teaboy27'
              });

            if (error) throw error;
          }

          console.log('Subscribed to push notifications successfully!');
          updateNotificationsBtnUI();
          alert('Notifications enabled successfully! You will now receive notifications even when the app is closed.');
        } catch (err) {
          console.error('Failed to subscribe to push notifications:', err);
          alert('Failed to enable notifications: ' + err.message);
        }
      }
    } catch (e) {
      console.error('Failed to access service worker registration:', e);
      alert('Service worker error. Please refresh and try again.');
    }
  });
}

// Insert a notification row into Supabase and trigger Vercel Serverless Web Push
async function sendPushNotification(title, body) {
  if (!isConfigured) {
    console.log('[Mock Push] Notification triggered:', { title, body });
    return;
  }

  // 1. Insert into database (always do this so notifications list page works)
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({ title, body, read: false });
    if (error) {
      console.warn('Failed to insert notification:', error);
    }
  } catch (err) {
    console.error('Error in inserting notification row:', err);
  }

  // 2. Call Vercel serverless function to send physical Web Push notification
  try {
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('Vercel push function returned status:', res.status, errData);
    }
  } catch (err) {
    console.error('Failed to trigger serverless push notification:', err);
  }
}







// ---- Theme Toggle & Styling ----
function triggerThemeAsmrEffect(button, theme) {
  const rect = button.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // 1. Floating Text Pop
  const phrase = theme === 'dark' ? 'Dark theme 🌙' : 'Light theme ☀️';
  const textPop = document.createElement('div');
  textPop.className = 'asmr-text-pop';
  textPop.style.color = theme === 'dark' ? 'var(--accent-tea)' : 'var(--accent-matcha)';
  textPop.textContent = phrase;
  textPop.style.left = `${centerX}px`;
  textPop.style.top = `${centerY - 20}px`;
  document.body.appendChild(textPop);
  
  setTimeout(() => textPop.remove(), 2200);

  // 2. Emoji Particles
  const emojis = theme === 'dark' ? ['✨', '🌙', '💤'] : ['☀️', '✨', '☕'];
  const numParticles = 8 + Math.floor(Math.random() * 4);
  
  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('div');
    particle.className = 'asmr-particle';
    particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    particle.style.left = `${centerX - 10}px`;
    particle.style.top = `${centerY - 10}px`;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const rot = `${Math.random() * 720 - 360}deg`;
    
    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    particle.style.setProperty('--rot', rot);
    
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1800);
  }
}

function setupTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update PWA theme-color meta tag
    const themeColor = newTheme === 'dark' ? '#7EA185' : '#45643C';
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeColor);
    }
    
    triggerThemeAsmrEffect(themeToggleBtn, newTheme);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
