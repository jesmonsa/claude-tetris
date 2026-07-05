'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - azul pálido
  '#ffb74d', // L - orange
  '#f06292', // + cross - magenta
  '#aed581', // U - lima
  '#ff8a65', // Y - naranja
  '#fff176', // single - amarillo brillante
  '#ce93d8', // hollow 3×3 - lila
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

// Tipos 8-12: piezas especiales. Las formas usan el índice como valor de color.
const SPECIAL_SHAPES = {
  8:  [[0,8,0],[8,8,8],[0,8,0]],           // + cross (pentominó)
  9:  [[9,0,9],[9,9,9],[0,0,0]],           // U (pentominó)
  10: [[0,10],[10,10],[0,10],[0,10]],       // Y (pentominó)
  11: [[11]],                               // single 1×1 (recompensa Tetris)
  12: [[12,12,12],[12,0,12],[12,12,12]],   // hueca 3×3 (rara)
};

const LINE_SCORES = [0, 100, 300, 500, 800];

const CANVAS_THEMES = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#d5d5e0', highlight: 'rgba(0,0,0,0.08)' },
};

let canvasTheme = CANVAS_THEMES.dark;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayScoresEl = document.getElementById('overlay-scores');
const startScoresEl = document.getElementById('start-scores');
const startStatsEl = document.getElementById('start-stats');
const statComboEl = document.getElementById('stat-combo');
const statMaxlinesEl = document.getElementById('stat-maxlines');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, pendingSingle, sessionBestCombo;

// --- Highscore helpers ---

function loadHighscores() {
  try { return JSON.parse(localStorage.getItem('tetris-highscores')) || []; }
  catch { return []; }
}

function saveHighscores(scores) {
  try { localStorage.setItem('tetris-highscores', JSON.stringify(scores)); }
  catch { /* quota exceeded — score not persisted */ }
}

// True if score would enter the top 5
function isTopFive(s) {
  const scores = loadHighscores();
  return scores.length < 5 || s > (scores[scores.length - 1].score || 0);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderHighscores(container, highlightIdx = -1) {
  const scores = loadHighscores();
  if (!scores.length) {
    container.innerHTML = '<p class="hs-empty">Sin records aún</p>';
    return;
  }
  const rows = scores.map((e, i) => {
    const cls = i === highlightIdx ? ' class="hs-new"' : '';
    const name = escapeHtml(e.name || '—');
    const pts = (typeof e.score === 'number' ? e.score : 0).toLocaleString();
    return `<tr${cls}><td>${i + 1}</td><td>${name}</td><td>${pts}</td></tr>`;
  }).join('');
  container.innerHTML =
    `<table class="hs-table"><thead><tr><th>#</th><th>Nombre</th><th>Puntos</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

function saveAndShowScores() {
  if (nameEntry.classList.contains('hidden')) return; // guard against double-save
  const name = playerNameInput.value.trim() || 'Anónimo';
  const entry = { name, score };
  const scores = loadHighscores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, 5);
  const newIdx = trimmed.indexOf(entry); // reference equality — same object we pushed
  saveHighscores(trimmed);
  nameEntry.classList.add('hidden');
  renderHighscores(overlayScoresEl, newIdx);
}

// --- Game functions ---

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makeShape(type) {
  const src = type <= 7 ? PIECES[type] : SPECIAL_SHAPES[type];
  return src.map(row => [...row]);
}

function randomPiece() {
  let type;
  if (pendingSingle) {
    pendingSingle = false;
    type = 11;
  } else {
    // Pesos: clásicas 80%, cross 6%, U 5%, Y 4%, hueca 5%
    const roll = Math.random() * 100;
    if      (roll < 80) type = Math.floor(Math.random() * 7) + 1;
    else if (roll < 86) type = 8;
    else if (roll < 91) type = 9;
    else if (roll < 95) type = 10;
    else                type = 12;
  }
  const shape = makeShape(type);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    if (cleared === 4) pendingSingle = true; // recompensa Tetris: próxima pieza es single
    if (cleared > sessionBestCombo) sessionBestCombo = cleared;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = canvasTheme.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = canvasTheme.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  // Update all-time global records if this game beat them
  try {
    const prevCombo = parseInt(localStorage.getItem('tetris-bestcombo') || '0', 10);
    const prevMaxLines = parseInt(localStorage.getItem('tetris-maxlines') || '0', 10);
    if (sessionBestCombo > prevCombo) localStorage.setItem('tetris-bestcombo', sessionBestCombo);
    if (lines > prevMaxLines) localStorage.setItem('tetris-maxlines', lines);
  } catch { /* storage unavailable — stats not persisted */ }

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  if (isTopFive(score)) {
    nameEntry.classList.remove('hidden');
    overlayScoresEl.innerHTML = '';
    playerNameInput.value = '';
    playerNameInput.focus();
  } else {
    nameEntry.classList.add('hidden');
    renderHighscores(overlayScoresEl);
  }
}

function togglePause() {
  if (!board || gameOver) return; // ignore P before game starts or after game over
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameEntry.classList.add('hidden');
    overlayScoresEl.innerHTML = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      // Fuerza el drop inmediato de la nueva pieza en el siguiente frame,
      // evitando esperar dropInterval completo cuando el tablero ya está lleno.
      if (!gameOver) dropAccum = dropInterval;
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  pendingSingle = false;
  sessionBestCombo = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  renderHighscores(startScoresEl);
  try {
    const bestCombo = parseInt(localStorage.getItem('tetris-bestcombo') || '0', 10);
    const maxLines = parseInt(localStorage.getItem('tetris-maxlines') || '0', 10);
    statComboEl.textContent = bestCombo;
    statMaxlinesEl.textContent = maxLines;
    startStatsEl.classList.toggle('hidden', !bestCombo && !maxLines);
  } catch { startStatsEl.classList.add('hidden'); }
  startScreen.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (!current || paused || gameOver) return; // ignore keys before game starts
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

resetScoresBtn.addEventListener('click', () => {
  localStorage.removeItem('tetris-highscores');
  localStorage.removeItem('tetris-bestcombo');
  localStorage.removeItem('tetris-maxlines');
  renderHighscores(startScoresEl);
  startStatsEl.classList.add('hidden');
});

saveScoreBtn.addEventListener('click', saveAndShowScores);

playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveAndShowScores();
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  canvasTheme = CANVAS_THEMES[theme] || CANVAS_THEMES.dark;
  localStorage.setItem('tetris-theme', theme);
  themeToggle.checked = theme === 'light';
  if (current) {
    draw();
    drawNext();
  }
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

applyTheme(localStorage.getItem('tetris-theme') || 'dark');

showStartScreen();
