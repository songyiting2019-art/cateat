"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const resultScreen = document.getElementById("resultScreen");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

// =========================
// CONFIG
// =========================
const CONFIG = {
  game: {
    time: 60,
    winScore: 850,
    starTargets: [850, 1200, 1400],
    initialObjectCount: 78,
    maxObjectCount: 104
  },
  player: {
    initialRadius: 22,
    ease: 0.075,
    maxSpeed: 210,
    keyboardTargetDistance: 128,
    growthRate: 0.066,
    growthSlowdown: 0.36,
    growthSlowdownRadius: 58,
    crocodileReadyScore: 1200,
    crocodileReadyRadius: 96
  },
  collision: {
    eatRatio: 0.74,
    crocodileEatRatio: 0.92,
    eatAssistRatio: 0.16,
    dangerCollisionRatio: 0.65,
    warningDistance: 150
  },
  world: {
    minWidth: 1400,
    minHeight: 1050,
    widthScale: 2.45,
    heightScale: 2.35
  },
  spawn: {
    playerSafeDistance: 190,
    pressureMinDistance: 300,
    pressureMaxDistance: 620,
    objectPadding: 18,
    overlapPadding: 5,
    maxAttempts: 28,
    refillLowCount: 50,
    refillEdibleCount: 13,
    refillBatch: 14,
    bonusCrocodiles: 5,
    minCrocodilesAfterReady: 4,
    crocodileRefillBatch: 2
  },
  threat: {
    chaseRange: 680,
    chaseSpeed: 38
  },
  feedback: {
    scorePopupLife: 0.7,
    rippleLife: 0.45,
    particleCount: 14
  },
  phases: [
    { name: "爽吃期", start: 0, end: 20, weights: [37, 33, 19, 8, 4, 1], refillSmallOnly: false, threatMultiplier: 0.95, pressureSpawnChance: 0.22 },
    { name: "稳定期", start: 20, end: 45, weights: [24, 28, 25, 15, 8, 4], refillSmallOnly: false, threatMultiplier: 1.16, pressureSpawnChance: 0.34 },
    { name: "压力期", start: 45, end: 60, weights: [13, 19, 24, 21, 16, 11], refillSmallOnly: false, threatMultiplier: 1.5, pressureSpawnChance: 0.48 }
  ]
};

const GAME_TIME = CONFIG.game.time;
const WIN_SCORE = CONFIG.game.winScore;
const STAR_TARGETS = CONFIG.game.starTargets;
const INITIAL_PLAYER_RADIUS = CONFIG.player.initialRadius;
const OBJECT_COUNT = CONFIG.game.initialObjectCount;
const MAX_OBJECT_COUNT = CONFIG.game.maxObjectCount;
const EAT_RATIO = CONFIG.collision.eatRatio;
const GROWTH_RATE = CONFIG.player.growthRate;
const PLAYER_EASE = CONFIG.player.ease;
const PLAYER_MAX_SPEED = CONFIG.player.maxSpeed;
const KEYBOARD_TARGET_DISTANCE = CONFIG.player.keyboardTargetDistance;
const DANGER_COLLISION_RATIO = CONFIG.collision.dangerCollisionRatio;
const WARNING_DISTANCE = CONFIG.collision.warningDistance;
const THREAT_CHASE_RANGE = CONFIG.threat.chaseRange;
const THREAT_CHASE_SPEED = CONFIG.threat.chaseSpeed;

const objectTypes = [
  { name: "小虾", minRadius: 8, maxRadius: 12, score: 5, color: "#ff9aa8", accent: "#e35f74" },
  { name: "小鱼", minRadius: 12, maxRadius: 18, score: 10, color: "#ffe27a", accent: "#d69b21" },
  { name: "中鱼", minRadius: 18, maxRadius: 26, score: 20, color: "#8fd8ff", accent: "#317fbd" },
  { name: "螃蟹", minRadius: 26, maxRadius: 34, score: 35, color: "#ff876b", accent: "#bf4d42" },
  { name: "大鱼", minRadius: 34, maxRadius: 46, score: 60, color: "#b99cff", accent: "#6f54c7" },
  { name: "鳄鱼", minRadius: 66, maxRadius: 86, score: 100, color: "#65b96f", accent: "#256f42" }
];

// =========================
// GAME_STATE
// =========================
let gameState = "start";
let width = 0;
let height = 0;
let worldWidth = 0;
let worldHeight = 0;
let deviceScale = 1;
let lastFrameTime = 0;
let score = 0;
let remainingTime = GAME_TIME;
let objects = [];
let particles = [];
let ripples = [];
let bubbles = [];
let scorePopups = [];
let dangerMessage = "";
let debugMode = false;
let bonusCrocodilesAdded = false;

const camera = {
  x: 0,
  y: 0
};

// =========================
// INPUT
// =========================
const input = {
  screenX: 0,
  screenY: 0,
  active: false
};

const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

// =========================
// PLAYER
// =========================
const player = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  radius: INITIAL_PLAYER_RADIUS
};

function initGame() {
  updateWorldSize();
  score = 0;
  remainingTime = GAME_TIME;
  dangerMessage = "";
  bonusCrocodilesAdded = false;
  input.active = false;
  resetKeys();
  gameState = "playing";
  player.radius = INITIAL_PLAYER_RADIUS;
  player.x = worldWidth * 0.5;
  player.y = worldHeight * 0.5;
  player.targetX = player.x;
  player.targetY = player.y;
  updateCamera();
  objects = [];
  objects = generateObjects(OBJECT_COUNT);
  particles = [];
  ripples = [];
  scorePopups = [];
  createBubbles();
  startScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");
  lastFrameTime = performance.now();
}

function restartGame() {
  initGame();
}

// =========================
// OBJECTS
// =========================
function generateObjects(count, smallOnly = false) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    list.push(createObject(smallOnly, list));
  }
  return list;
}

function createObject(smallOnly = false, pendingObjects = [], forcedType = null) {
  const type = forcedType || pickObjectType(smallOnly);
  const radius = randomBetween(type.minRadius, type.maxRadius);
  const margin = radius + CONFIG.spawn.objectPadding;
  const phase = getCurrentPhase();
  const pressureSpawn = gameState === "playing" &&
    !smallOnly &&
    radius >= player.radius * EAT_RATIO &&
    Math.random() < phase.pressureSpawnChance;
  let x = margin;
  let y = margin;

  for (let attempt = 0; attempt < CONFIG.spawn.maxAttempts; attempt += 1) {
    if (pressureSpawn) {
      const point = getPressureSpawnPoint(radius);
      x = point.x;
      y = point.y;
    } else {
      x = randomBetween(margin, Math.max(margin, worldWidth - margin));
      y = randomBetween(margin, Math.max(margin, worldHeight - margin));
    }

    const farEnoughFromPlayer = gameState !== "playing" ||
      getDistance(x, y, player.x, player.y) > player.radius + radius + CONFIG.spawn.playerSafeDistance;
    const farEnoughFromObjects = !hasObjectOverlap(x, y, radius, pendingObjects);

    if (farEnoughFromPlayer && farEnoughFromObjects) {
      break;
    }
  }

  return {
    type,
    x,
    y,
    radius,
    angle: randomBetween(0, Math.PI * 2),
    drift: randomBetween(0.25, 0.75),
    wiggle: randomBetween(0, Math.PI * 2),
    eaten: false
  };
}

function getPressureSpawnPoint(radius) {
  const angle = randomBetween(0, Math.PI * 2);
  const distance = randomBetween(CONFIG.spawn.pressureMinDistance, CONFIG.spawn.pressureMaxDistance);

  return {
    x: clamp(player.x + Math.cos(angle) * distance, radius + CONFIG.spawn.objectPadding, worldWidth - radius - CONFIG.spawn.objectPadding),
    y: clamp(player.y + Math.sin(angle) * distance, radius + CONFIG.spawn.objectPadding, worldHeight - radius - CONFIG.spawn.objectPadding)
  };
}

function hasObjectOverlap(x, y, radius, pendingObjects) {
  const allObjects = objects.concat(pendingObjects);
  return allObjects.some((item) => {
    const safeDistance = radius + item.radius + CONFIG.spawn.overlapPadding;
    return getDistance(x, y, item.x, item.y) < safeDistance;
  });
}

function pickObjectType(smallOnly = false) {
  if (smallOnly) {
    return objectTypes[Math.floor(Math.random() * 2)];
  }

  const phase = getCurrentPhase();
  const totalWeight = phase.weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < objectTypes.length; i += 1) {
    roll -= phase.weights[i];
    if (roll <= 0) {
      return objectTypes[i];
    }
  }

  return objectTypes[objectTypes.length - 1];
}

function getCurrentPhase() {
  const elapsedTime = GAME_TIME - remainingTime;
  return CONFIG.phases.find((phase) => elapsedTime >= phase.start && elapsedTime < phase.end) ||
    CONFIG.phases[CONFIG.phases.length - 1];
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(320, rect.width);
  height = Math.max(420, rect.height);
  canvas.width = Math.floor(width * deviceScale);
  canvas.height = Math.floor(height * deviceScale);
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  updateWorldSize();

  player.x = clamp(player.x || worldWidth * 0.5, player.radius, worldWidth - player.radius);
  player.y = clamp(player.y || worldHeight * 0.5, player.radius, worldHeight - player.radius);
  player.targetX = clamp(player.targetX || player.x, player.radius, worldWidth - player.radius);
  player.targetY = clamp(player.targetY || player.y, player.radius, worldHeight - player.radius);
  updateCamera();

  createBubbles();
}

function updateWorldSize() {
  // 世界地图比屏幕大，镜头会跟随小猫移动，只显示池塘的一部分。
  worldWidth = Math.max(1400, width * 2.45);
  worldHeight = Math.max(1050, height * 2.35);
}

function createBubbles() {
  const bubbleCount = Math.max(14, Math.floor((width * height) / 52000));
  bubbles = Array.from({ length: bubbleCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: randomBetween(2, 7),
    speed: randomBetween(8, 22),
    alpha: randomBetween(0.18, 0.42)
  }));
}

function handleInput(clientX, clientY) {
  if (gameState !== "playing") {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  input.screenX = clientX - rect.left;
  input.screenY = clientY - rect.top;
  input.active = true;
  updateTargetFromInput();
}

function updateTargetFromInput() {
  if (!input.active) {
    return;
  }

  player.targetX = clamp(camera.x + input.screenX, player.radius, worldWidth - player.radius);
  player.targetY = clamp(camera.y + input.screenY, player.radius, worldHeight - player.radius);
}

function update(deltaSeconds) {
  if (gameState !== "playing") {
    return;
  }

  remainingTime -= deltaSeconds;
  if (remainingTime <= 0) {
    remainingTime = 0;
    endGameByStars();
    return;
  }

  if (!updateKeyboardControl()) {
    updateTargetFromInput();
  }

  movePlayerTowardTarget(deltaSeconds);
  player.x = clamp(player.x, player.radius, worldWidth - player.radius);
  player.y = clamp(player.y, player.radius, worldHeight - player.radius);

  updateObjects(deltaSeconds);
  updateEffects(deltaSeconds);
  checkCollisions();
  if (gameState !== "playing") {
    return;
  }
  updateCamera();
  replenishObjects();
}

function updateCamera() {
  camera.x = clamp(player.x - width * 0.5, 0, Math.max(0, worldWidth - width));
  camera.y = clamp(player.y - height * 0.5, 0, Math.max(0, worldHeight - height));
}

function updateKeyboardControl() {
  const directionX = Number(keys.right) - Number(keys.left);
  const directionY = Number(keys.down) - Number(keys.up);
  const length = Math.hypot(directionX, directionY);

  if (length === 0) {
    return false;
  }

  input.active = false;
  player.targetX = clamp(
    player.x + (directionX / length) * KEYBOARD_TARGET_DISTANCE,
    player.radius,
    worldWidth - player.radius
  );
  player.targetY = clamp(
    player.y + (directionY / length) * KEYBOARD_TARGET_DISTANCE,
    player.radius,
    worldHeight - player.radius
  );
  return true;
}

function movePlayerTowardTarget(deltaSeconds) {
  const distanceX = player.targetX - player.x;
  const distanceY = player.targetY - player.y;
  const distance = Math.hypot(distanceX, distanceY);

  if (distance < 0.1) {
    return;
  }

  // 鼠标目标离得很远时也限制最高速度，避免小猫突然冲出去。
  const easedStep = distance * PLAYER_EASE;
  const maxStep = PLAYER_MAX_SPEED * deltaSeconds;
  const step = Math.min(distance, easedStep, maxStep);

  player.x += (distanceX / distance) * step;
  player.y += (distanceY / distance) * step;
}

function updateObjects(deltaSeconds) {
  const phase = getCurrentPhase();
  for (const item of objects) {
    item.wiggle += deltaSeconds * item.drift * 2.4;
    item.x += Math.cos(item.wiggle) * item.drift * 0.22;
    item.y += Math.sin(item.wiggle * 0.8) * item.drift * 0.18;

    if (!canEat(item)) {
      moveThreatTowardPlayer(item, deltaSeconds, phase);
    }

    item.x = clamp(item.x, item.radius + 8, worldWidth - item.radius - 8);
    item.y = clamp(item.y, item.radius + 8, worldHeight - item.radius - 8);
  }
}

function moveThreatTowardPlayer(item, deltaSeconds, phase) {
  const distanceX = player.x - item.x;
  const distanceY = player.y - item.y;
  const distance = Math.hypot(distanceX, distanceY);

  if (distance <= 0.1 || distance > THREAT_CHASE_RANGE) {
    return;
  }

  // 危险目标只慢慢施压，不做高速追击，避免难度突然失控。
  const sizeBoost = clamp(item.radius / 46, 0.5, 1);
  const pressure = 1 - distance / THREAT_CHASE_RANGE;
  const speed = THREAT_CHASE_SPEED * phase.threatMultiplier * sizeBoost * (0.45 + pressure);
  item.x += (distanceX / distance) * speed * deltaSeconds;
  item.y += (distanceY / distance) * speed * deltaSeconds;
}

function updateEffects(deltaSeconds) {
  for (const particle of particles) {
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.life -= deltaSeconds;
    particle.radius += deltaSeconds * 6;
  }

  for (const ripple of ripples) {
    ripple.life -= deltaSeconds;
    ripple.radius += deltaSeconds * 90;
  }

  for (const bubble of bubbles) {
    bubble.y -= bubble.speed * deltaSeconds;
    if (bubble.y < -bubble.radius) {
      bubble.y = height + bubble.radius;
      bubble.x = Math.random() * width;
    }
  }

  for (const popup of scorePopups) {
    popup.y -= deltaSeconds * 42;
    popup.life -= deltaSeconds;
  }

  particles = particles.filter((particle) => particle.life > 0);
  ripples = ripples.filter((ripple) => ripple.life > 0);
  scorePopups = scorePopups.filter((popup) => popup.life > 0);
}

// =========================
// COLLISION
// =========================
function checkCollisions() {
  for (const item of objects) {
    if (item.eaten) {
      continue;
    }

    const distance = getDistance(player.x, player.y, item.x, item.y);
    // 可吃目标进入捕食范围时被吞噬；太大的目标发生接触会直接失败。
    if (canEat(item) && distance < getEatDistance(item)) {
      item.eaten = true;
      score += item.type.score;
      player.radius += getGrowthAmount(item);
      handleScoreMilestone();
      createEatEffect(item.x, item.y, item.type.color, item.type.score);
      if (getStarCount(score) >= STAR_TARGETS.length) {
        endGame("win", getResultMessage(getStarCount(score), true));
        return;
      }
    } else if (!canEat(item) && isDangerCollision(distance, item)) {
      dangerMessage = `撞到了${item.type.name}，${getStarText(getStarCount(score))} 本局得分：${score} / ${STAR_TARGETS[STAR_TARGETS.length - 1]}`;
      endGame("lose", dangerMessage);
      return;
    }
  }

  objects = objects.filter((item) => !item.eaten);
}

function canEat(item) {
  if (item.type.name === "鳄鱼" && score < CONFIG.player.crocodileReadyScore) {
    return false;
  }

  return item.radius < player.radius * getEatRatio(item);
}

function getEatRatio(item) {
  return item.type.name === "鳄鱼" ? CONFIG.collision.crocodileEatRatio : EAT_RATIO;
}

function getEatDistance(item) {
  return player.radius + item.radius * CONFIG.collision.eatAssistRatio;
}

function getGrowthAmount(item) {
  const growthProgress = clamp(
    (player.radius - INITIAL_PLAYER_RADIUS) / CONFIG.player.growthSlowdownRadius,
    0,
    1
  );
  const dynamicRate = GROWTH_RATE * (1 - growthProgress * CONFIG.player.growthSlowdown);
  return item.radius * dynamicRate;
}

function getDangerRadius(item) {
  return item.radius * DANGER_COLLISION_RATIO;
}

function isDangerCollision(distance, item) {
  return distance < player.radius + getDangerRadius(item);
}

function replenishObjects() {
  replenishCrocodilesAfterReady();

  const edibleCount = objects.filter((item) => canEat(item)).length;
  const phase = getCurrentPhase();

  if (objects.length < CONFIG.spawn.refillLowCount || edibleCount < CONFIG.spawn.refillEdibleCount) {
    // 后期补小目标，但保留总数上限，避免越补越卡。
    const availableSlots = MAX_OBJECT_COUNT - objects.length;
    if (availableSlots > 0) {
      const addCount = Math.min(CONFIG.spawn.refillBatch, availableSlots);
      objects.push(...generateObjects(addCount, phase.refillSmallOnly));
    }
  }
}

function handleScoreMilestone() {
  if (score < CONFIG.player.crocodileReadyScore || bonusCrocodilesAdded) {
    return;
  }

  bonusCrocodilesAdded = true;
  player.radius = Math.max(player.radius, CONFIG.player.crocodileReadyRadius);
  createGrowthBurst();
  addBonusCrocodiles();
}

function addBonusCrocodiles() {
  const crocodileType = objectTypes.find((type) => type.name === "鳄鱼");
  const newCrocodiles = [];

  for (let i = 0; i < CONFIG.spawn.bonusCrocodiles; i += 1) {
    newCrocodiles.push(createObject(false, newCrocodiles, crocodileType));
  }

  objects.push(...newCrocodiles);
}

function replenishCrocodilesAfterReady() {
  if (score < CONFIG.player.crocodileReadyScore) {
    return;
  }

  const crocodileCount = objects.filter((item) => item.type.name === "鳄鱼").length;
  const availableSlots = MAX_OBJECT_COUNT - objects.length;
  if (crocodileCount >= CONFIG.spawn.minCrocodilesAfterReady || availableSlots <= 0) {
    return;
  }

  const addCount = Math.min(
    CONFIG.spawn.crocodileRefillBatch,
    CONFIG.spawn.minCrocodilesAfterReady - crocodileCount,
    availableSlots
  );
  const crocodileType = objectTypes.find((type) => type.name === "鳄鱼");
  const newCrocodiles = [];

  for (let i = 0; i < addCount; i += 1) {
    newCrocodiles.push(createObject(false, newCrocodiles, crocodileType));
  }

  objects.push(...newCrocodiles);
}

function createGrowthBurst() {
  ripples.push({
    x: player.x,
    y: player.y,
    radius: player.radius * 0.75,
    life: CONFIG.feedback.rippleLife * 1.5,
    color: "#fff176"
  });
  scorePopups.push({
    x: player.x,
    y: player.y - player.radius - 12,
    text: "可以吃鳄鱼了！",
    life: CONFIG.feedback.scorePopupLife * 1.4
  });
}

function createEatEffect(x, y, color, scoreValue) {
  ripples.push({ x, y, radius: 6, life: CONFIG.feedback.rippleLife, color });
  scorePopups.push({
    x,
    y: y - 12,
    text: `+${scoreValue}`,
    life: CONFIG.feedback.scorePopupLife
  });

  for (let i = 0; i < CONFIG.feedback.particleCount; i += 1) {
    const angle = (Math.PI * 2 * i) / CONFIG.feedback.particleCount;
    const speed = randomBetween(55, 125);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomBetween(2, 4),
      life: randomBetween(0.28, 0.55),
      color
    });
  }
}

function getStarCount(currentScore) {
  return STAR_TARGETS.reduce((count, target) => currentScore >= target ? count + 1 : count, 0);
}

function getStarText(stars) {
  const full = "★".repeat(stars);
  const empty = "☆".repeat(STAR_TARGETS.length - stars);
  return `${full}${empty}`;
}

function getNextStarTarget() {
  return STAR_TARGETS.find((target) => score < target) || STAR_TARGETS[STAR_TARGETS.length - 1];
}

function getResultMessage(stars, earlyComplete = false) {
  const prefix = earlyComplete ? "三星目标达成！" : "本局结束！";
  return `${prefix} ${getStarText(stars)} 本局得分：${score} / ${STAR_TARGETS[STAR_TARGETS.length - 1]}`;
}

function endGameByStars() {
  const stars = getStarCount(score);
  endGame(stars > 0 ? "win" : "lose", getResultMessage(stars));
}

function endGame(nextState, customMessage = "") {
  gameState = nextState;
  input.active = false;
  resetKeys();
  const stars = getStarCount(score);
  resultTitle.textContent = nextState === "win" ? `${getStarText(stars)} 挑战完成` : "挑战失败";
  resultMessage.textContent = customMessage || `本局得分：${score} / ${WIN_SCORE}`;
  resultScreen.classList.remove("hidden");
}

// =========================
// RENDER
// =========================
function draw() {
  drawPondBackground();

  if (gameState === "start") {
    drawStartPreview();
  } else {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawWorldGuide();
    drawObjects();
    drawEffects();
    drawPlayer();
    ctx.restore();
    drawHud();
    drawDebugPanel();
  }
}

function drawPondBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#d5f8ff");
  gradient.addColorStop(0.46, "#8ee2f1");
  gradient.addColorStop(1, "#53bdcf");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  for (let y = 95; y < height; y += 86) {
    for (let x = -40; x < width + 80; x += 120) {
      ctx.beginPath();
      ctx.ellipse(x + (y % 170), y, 46, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  for (const bubble of bubbles) {
    ctx.globalAlpha = bubble.alpha;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorldGuide() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, worldWidth - 6, worldHeight - 6);

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#2aa7af";
  for (let y = 160; y < worldHeight; y += 260) {
    for (let x = 140; x < worldWidth; x += 310) {
      ctx.beginPath();
      ctx.ellipse(x, y, 70, 18, Math.sin(x + y) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStartPreview() {
  const previewPlayer = {
    x: width * 0.5,
    y: Math.min(height * 0.72, height - 96),
    radius: 30
  };
  drawCat(previewPlayer.x, previewPlayer.y, previewPlayer.radius);
  drawFishShape(width * 0.5 - 88, previewPlayer.y + 8, 15, objectTypes[1], 0, true);
  drawShrimpShape(width * 0.5 + 86, previewPlayer.y - 10, 11, objectTypes[0], 0.3, true);
}

function drawObjects() {
  const sortedObjects = [...objects].sort((a, b) => a.radius - b.radius);
  for (const item of sortedObjects) {
    if (!isObjectVisible(item)) {
      continue;
    }
    const edible = canEat(item);
    drawThreatLink(item, edible);
    drawObjectHint(item, edible);

    if (item.type.name === "小虾") {
      drawShrimpShape(item.x, item.y, item.radius, item.type, item.wiggle, edible);
    } else if (item.type.name === "螃蟹") {
      drawCrabShape(item.x, item.y, item.radius, item.type, item.wiggle, edible);
    } else if (item.type.name === "鳄鱼") {
      drawCrocodileShape(item.x, item.y, item.radius, item.type, item.wiggle, edible);
    } else {
      drawFishShape(item.x, item.y, item.radius, item.type, item.wiggle, edible);
    }

    drawObjectLabel(item);
  }
}

function isObjectVisible(item) {
  const margin = item.radius + 80;
  return item.x > camera.x - margin &&
    item.x < camera.x + width + margin &&
    item.y > camera.y - margin &&
    item.y < camera.y + height + margin;
}

function drawObjectHint(item, edible) {
  const dangerRadius = getDangerRadius(item);
  const distanceToPlayer = getDistance(player.x, player.y, item.x, item.y);
  const isWarning = !edible && distanceToPlayer < player.radius + dangerRadius + WARNING_DISTANCE;

  ctx.save();
  ctx.lineWidth = edible ? 3 : isWarning ? 4 : 2.5;
  ctx.globalAlpha = edible ? 0.38 : isWarning ? 0.86 : 0.58;
  ctx.strokeStyle = edible ? "#fff7a8" : "#ff3045";
  if (!edible) {
    ctx.setLineDash(isWarning ? [7, 5] : [10, 7]);
  }
  ctx.beginPath();
  ctx.arc(item.x, item.y, edible ? item.radius + 7 : dangerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (!edible) {
    drawDangerMark(item, dangerRadius, isWarning);
  }
}

function drawThreatLink(item, edible) {
  if (edible) {
    return;
  }

  const dangerRadius = getDangerRadius(item);
  const distanceToPlayer = getDistance(player.x, player.y, item.x, item.y);
  if (distanceToPlayer > player.radius + dangerRadius + WARNING_DISTANCE) {
    return;
  }

  const alpha = clamp(1 - (distanceToPlayer - player.radius - dangerRadius) / WARNING_DISTANCE, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.16 + alpha * 0.32;
  ctx.strokeStyle = "#ff3045";
  ctx.lineWidth = 2 + alpha * 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(item.x, item.y);
  ctx.lineTo(player.x, player.y);
  ctx.stroke();
  ctx.restore();
}

function drawDangerMark(item, dangerRadius, isWarning) {
  const markY = item.y - dangerRadius - 12;
  ctx.save();
  ctx.fillStyle = isWarning ? "#ff3045" : "rgba(255,48,69,0.78)";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(item.x, markY, isWarning ? 10 : 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${isWarning ? 16 : 13}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", item.x, markY + 1);
  ctx.restore();
}

function drawFishShape(x, y, radius, type, wiggle, edible) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wiggle) * 0.12);
  ctx.globalAlpha = edible ? 1 : 0.82;

  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.05, radius * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = type.accent;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.9, 0);
  ctx.lineTo(-radius * 1.38, -radius * 0.56);
  ctx.lineTo(-radius * 1.36, radius * 0.56);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.beginPath();
  ctx.ellipse(radius * 0.08, -radius * 0.18, radius * 0.55, radius * 0.16, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#253238";
  ctx.beginPath();
  ctx.arc(radius * 0.5, -radius * 0.18, Math.max(2, radius * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShrimpShape(x, y, radius, type, wiggle, edible) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wiggle) * 0.18);
  ctx.globalAlpha = edible ? 1 : 0.82;
  ctx.strokeStyle = type.accent;
  ctx.lineWidth = Math.max(3, radius * 0.28);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, Math.PI * 0.1, Math.PI * 1.45);
  ctx.stroke();

  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.arc(radius * 0.45, -radius * 0.4, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = type.accent;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-radius * 0.35 + i * radius * 0.25, radius * 0.55);
    ctx.lineTo(-radius * 0.58 + i * radius * 0.2, radius * 1.05);
    ctx.stroke();
  }

  ctx.fillStyle = "#253238";
  ctx.beginPath();
  ctx.arc(radius * 0.62, -radius * 0.55, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrabShape(x, y, radius, type, wiggle, edible) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wiggle) * 0.08);
  ctx.globalAlpha = edible ? 1 : 0.82;

  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.95, radius * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = type.accent;
  ctx.lineWidth = Math.max(2, radius * 0.11);
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * radius * 0.68, -radius * 0.05);
    ctx.lineTo(side * radius * 1.0, -radius * 0.42);
    ctx.lineTo(side * radius * 1.16, -radius * 0.2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(side * radius * 0.5, radius * 0.28);
    ctx.lineTo(side * radius * 0.98, radius * 0.52);
    ctx.stroke();
  }

  ctx.fillStyle = "#253238";
  ctx.beginPath();
  ctx.arc(-radius * 0.28, -radius * 0.16, Math.max(2, radius * 0.08), 0, Math.PI * 2);
  ctx.arc(radius * 0.28, -radius * 0.16, Math.max(2, radius * 0.08), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrocodileShape(x, y, radius, type, wiggle, edible) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(wiggle) * 0.06);
  ctx.globalAlpha = edible ? 1 : 0.86;

  ctx.fillStyle = type.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.18, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = type.accent;
  ctx.beginPath();
  ctx.ellipse(radius * 0.7, -radius * 0.03, radius * 0.62, radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eaffef";
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(radius * (0.24 + i * 0.18), radius * 0.22);
    ctx.lineTo(radius * (0.3 + i * 0.18), radius * 0.38);
    ctx.lineTo(radius * (0.36 + i * 0.18), radius * 0.22);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#253238";
  ctx.beginPath();
  ctx.arc(radius * 0.76, -radius * 0.18, Math.max(2.5, radius * 0.07), 0, Math.PI * 2);
  ctx.arc(radius * 0.46, -radius * 0.2, Math.max(2.3, radius * 0.06), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-radius * 0.22, -radius * 0.18, radius * 0.56, radius * 0.12, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawObjectLabel(item) {
  const fontSize = clamp(item.radius * 0.48, 10, 15);
  ctx.save();
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.fillStyle = "#24464c";
  ctx.strokeText(item.type.name, item.x, item.y + item.radius + 15);
  ctx.fillText(item.type.name, item.x, item.y + item.radius + 15);
  ctx.restore();
}

function drawEffects() {
  ctx.save();
  for (const ripple of ripples) {
    const alpha = Math.max(ripple.life / 0.45, 0);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ripple.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const particle of particles) {
    ctx.globalAlpha = Math.max(particle.life / 0.55, 0);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const popup of scorePopups) {
    const alpha = clamp(popup.life / CONFIG.feedback.scorePopupLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = "800 18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.fillStyle = "#ff7f50";
    ctx.strokeText(popup.text, popup.x, popup.y);
    ctx.fillText(popup.text, popup.x, popup.y);
  }
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#fff8b8";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  drawCat(player.x, player.y, player.radius);
}

function drawCat(x, y, radius) {
  ctx.save();
  ctx.translate(x, y);

  const furColor = "#78aee8";
  const furDark = "#386fa8";
  const muzzleColor = "#e8f6ff";
  const innerEarColor = "#f8a6bf";
  const lineColor = "#244f7c";

  ctx.fillStyle = furColor;
  ctx.strokeStyle = furDark;
  ctx.lineWidth = Math.max(2, radius * 0.08);

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * radius * 0.46, -radius * 0.66);
    ctx.lineTo(side * radius * 0.18, -radius * 1.08);
    ctx.lineTo(side * radius * 0.75, -radius * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = innerEarColor;
    ctx.beginPath();
    ctx.moveTo(side * radius * 0.43, -radius * 0.72);
    ctx.lineTo(side * radius * 0.25, -radius * 0.94);
    ctx.lineTo(side * radius * 0.6, -radius * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = furColor;
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = muzzleColor;
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.14, radius * 0.46, radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#263238";
  ctx.beginPath();
  ctx.arc(-radius * 0.28, -radius * 0.12, Math.max(2.5, radius * 0.08), 0, Math.PI * 2);
  ctx.arc(radius * 0.28, -radius * 0.12, Math.max(2.5, radius * 0.08), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e97676";
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.02);
  ctx.lineTo(-radius * 0.08, radius * 0.12);
  ctx.lineTo(radius * 0.08, radius * 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(1.2, radius * 0.035);
  ctx.beginPath();
  ctx.arc(-radius * 0.08, radius * 0.18, radius * 0.12, 0.2, Math.PI * 0.95);
  ctx.arc(radius * 0.08, radius * 0.18, radius * 0.12, Math.PI * 0.05, Math.PI * 0.8);
  ctx.stroke();

  ctx.strokeStyle = "rgba(36,79,124,0.58)";
  ctx.lineWidth = Math.max(1.1, radius * 0.03);
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * radius * 0.12, -radius * 0.48);
    ctx.lineTo(i * radius * 0.08, -radius * 0.24);
    ctx.stroke();
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(side * radius * 0.38, radius * (0.08 + i * 0.1));
      ctx.lineTo(side * radius * 0.82, radius * (-0.02 + i * 0.13));
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawHud() {
  const isNarrow = width < 560;
  const panelHeight = isNarrow ? 78 : 72;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillRect(0, 0, width, panelHeight);

  ctx.strokeStyle = "rgba(25, 121, 139, 0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, panelHeight);
  ctx.lineTo(width, panelHeight);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#155e6b";
  ctx.font = `800 ${isNarrow ? 20 : 24}px Arial, sans-serif`;
  ctx.fillText(`时间 ${Math.ceil(remainingTime)}s`, width * 0.5, isNarrow ? 21 : 22);

  ctx.fillStyle = "#155e6b";
  ctx.font = `700 ${isNarrow ? 15 : 17}px Arial, sans-serif`;
  ctx.fillText(`分数 ${score}`, width * 0.5, isNarrow ? 47 : 49);

  const progressWidth = Math.min(width * 0.82, 460);
  const progressX = (width - progressWidth) * 0.5;
  const progressY = panelHeight - 8;
  ctx.fillStyle = "rgba(19, 119, 135, 0.18)";
  roundRect(progressX, progressY, progressWidth, 5, 3);
  ctx.fill();
  ctx.fillStyle = "#ff9364";
  roundRect(progressX, progressY, progressWidth * clamp(score / STAR_TARGETS[STAR_TARGETS.length - 1], 0, 1), 5, 3);
  ctx.fill();
  ctx.restore();
}

function drawDebugPanel() {
  if (!debugMode) {
    return;
  }

  const phase = getCurrentPhase();
  const panelX = 12;
  const panelY = height - 112;
  const panelWidth = 190;
  const panelHeight = 94;

  ctx.save();
  ctx.fillStyle = "rgba(10, 42, 52, 0.72)";
  roundRect(panelX, panelY, panelWidth, panelHeight, 8);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 13px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`半径: ${player.radius.toFixed(1)}`, panelX + 12, panelY + 12);
  ctx.fillText(`阶段: ${phase.name}`, panelX + 12, panelY + 32);
  ctx.fillText(`分数: ${score}`, panelX + 12, panelY + 52);
  ctx.fillText(`对象: ${objects.length}`, panelX + 12, panelY + 72);
  ctx.restore();
}

function getSizeLevel() {
  if (player.radius < 30) return "幼猫";
  if (player.radius < 42) return "灵巧";
  if (player.radius < 56) return "高手";
  return "池塘王者";
}

function gameLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000 || 0, 0.033);
  lastFrameTime = timestamp;
  update(deltaSeconds);
  draw();
  requestAnimationFrame(gameLoop);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function setKeyState(key, pressed) {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "arrowup" || normalizedKey === "w") {
    keys.up = pressed;
  } else if (normalizedKey === "arrowdown" || normalizedKey === "s") {
    keys.down = pressed;
  } else if (normalizedKey === "arrowleft" || normalizedKey === "a") {
    keys.left = pressed;
  } else if (normalizedKey === "arrowright" || normalizedKey === "d") {
    keys.right = pressed;
  } else {
    return false;
  }

  return true;
}

function resetKeys() {
  keys.up = false;
  keys.down = false;
  keys.left = false;
  keys.right = false;
}

window.addEventListener("resize", resizeCanvas);

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "d" && !event.repeat) {
    debugMode = !debugMode;
  }

  if (setKeyState(event.key, true)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (setKeyState(event.key, false)) {
    event.preventDefault();
  }
});

window.addEventListener("blur", resetKeys);

canvas.addEventListener("mousemove", (event) => {
  handleInput(event.clientX, event.clientY);
});

canvas.addEventListener("touchstart", (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  handleInput(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  handleInput(touch.clientX, touch.clientY);
}, { passive: false });

canvas.addEventListener("touchend", () => {
  input.active = false;
});

canvas.addEventListener("touchcancel", () => {
  input.active = false;
});

startButton.addEventListener("click", initGame);
restartButton.addEventListener("click", restartGame);

resizeCanvas();
createBubbles();
lastFrameTime = performance.now();
requestAnimationFrame(gameLoop);
