const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const uiMenu = document.getElementById('menu-screen');
const uiGameOver = document.getElementById('game-over-screen');
const uiWin = document.getElementById('win-screen');
const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');
const highScoreDisplay = document.getElementById('high-score-display');
const finalScore = document.getElementById('final-score');
const winScore = document.getElementById('win-score');
const diffButtons = document.querySelectorAll('.diff-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Internal Resolution (scaled up by CSS)
const WIDTH = 800;
const HEIGHT = 600;
canvas.width = WIDTH;
canvas.height = HEIGHT;

// Game State
let state = "MENU"; // MENU, PLAYING, GAMEOVER, WON
let score = 0;
let highScore = localStorage.getItem('retroMarioHighScore') || 0;
let lives = 3;
let cameraX = 0;

highScoreDisplay.innerText = `HI: ${highScore.toString().padStart(6, '0')}`;

// Difficulty Settings
let difficulty = "medium";
let diffConfig = {
    easy: { enemySpeed: 1, maxLives: 5, gravMult: 0.9 },
    medium: { enemySpeed: 2, maxLives: 3, gravMult: 1.0 },
    hard: { enemySpeed: 3.5, maxLives: 1, gravMult: 1.1 },
    auto: { enemySpeed: 1.5, maxLives: 3, gravMult: 1.0 } // Starts slightly easier, scales up
};

// Physics Constants
const PLAYER_SIZE = 30;
const ACCEL = 0.5;
const FRICTION = 0.85;
const MAX_SPEED = 6;
const JUMP_FORCE = 13;
const GRAVITY = 0.65;
const COYOTE_TIME = 8; // frames
const JUMP_BUFFER = 8; // frames

// Input State
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

// Touch Input State
let touchLeft = false;
let touchRight = false;
let touchJump = false;

// Entities
let player = {};
let platforms = [];
let enemies = [];
let coins = [];
let particles = [];

// Initialize Player
function initPlayer() {
    player = {
        x: 50, y: HEIGHT - 100,
        w: PLAYER_SIZE, h: PLAYER_SIZE,
        vx: 0, vy: 0,
        onGround: false,
        facingRight: true,
        coyoteTimer: 0,
        jumpBufferTimer: 0
    };
}

// Generate Level
function createLevel() {
    cameraX = 0;
    
    // Ground
    platforms = [
        {x: 0, y: HEIGHT - 40, w: 3000, h: 40},
        {x: 200, y: 450, w: 150, h: 20},
        {x: 450, y: 380, w: 150, h: 20},
        {x: 750, y: 320, w: 200, h: 20},
        {x: 1050, y: 400, w: 150, h: 20},
        {x: 1300, y: 300, w: 200, h: 20},
        {x: 1600, y: 200, w: 150, h: 20},
        {x: 1900, y: 350, w: 200, h: 20},
        {x: 2200, y: 250, w: 300, h: 20},
        // Floating blocks
        {x: 500, y: 200, w: 100, h: 20},
        {x: 1400, y: 150, w: 150, h: 20}
    ];
    
    // Calculate initial enemy speed based on difficulty
    let eSpeed = diffConfig[difficulty].enemySpeed;

    enemies = [
        {x: 450, y: HEIGHT - 65, w: 25, h: 25, startX: 450, patrol: 150, dir: 1, speed: eSpeed},
        {x: 900, y: HEIGHT - 65, w: 25, h: 25, startX: 900, patrol: 200, dir: -1, speed: eSpeed},
        {x: 1350, y: 275, w: 25, h: 25, startX: 1350, patrol: 50, dir: 1, speed: eSpeed},
        {x: 1700, y: HEIGHT - 65, w: 25, h: 25, startX: 1700, patrol: 300, dir: 1, speed: eSpeed},
        {x: 2300, y: 225, w: 25, h: 25, startX: 2300, patrol: 100, dir: 1, speed: eSpeed},
    ];
    
    coins = [];
    for(let i=0; i<20; i++) {
        coins.push({
            x: 200 + Math.random() * 2500,
            y: 150 + Math.random() * 350,
            w: 15, h: 15,
            collected: false,
            bobOffset: Math.random() * Math.PI * 2
        });
    }
}

function spawnParticles(x, y, count, color="white") {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 1) * 8,
            life: 30 + Math.random() * 20,
            color: color
        });
    }
}

// -----------------------------------------
// INPUT HANDLING
// -----------------------------------------
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight') keys.ArrowRight = true;
    if (e.code === 'Space') {
        keys.Space = true;
        if(state === "PLAYING") player.jumpBufferTimer = JUMP_BUFFER;
    }
    
    // Start/Restart handling
    if (e.code === 'Enter' || e.code === 'Space') {
        if (state === "MENU") startGame();
        else if (state === "GAMEOVER" || state === "WON") resetGame();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight') keys.ArrowRight = false;
    if (e.code === 'Space') keys.Space = false;
});

// Menu Difficulty Selection
diffButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        diffButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        difficulty = e.target.getAttribute('data-diff');
    });
});

// Fullscreen Toggle
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
});

// Screen Tap to Start/Restart
document.querySelectorAll('.screen').forEach(screen => {
    screen.addEventListener('click', (e) => {
        // Prevent triggering if clicking a specific button inside the screen
        if(e.target.tagName === 'BUTTON') return; 
        
        if (state === "MENU") startGame();
        else if (state === "GAMEOVER" || state === "WON") resetGame();
    });
});

// Touch Controls
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');

btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); touchLeft = true; });
btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); touchLeft = false; });
btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); touchRight = true; });
btnRight.addEventListener('touchend', (e) => { e.preventDefault(); touchRight = false; });
btnJump.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    touchJump = true; 
    if(state === "PLAYING") player.jumpBufferTimer = JUMP_BUFFER;
});
btnJump.addEventListener('touchend', (e) => { e.preventDefault(); touchJump = false; });

// -----------------------------------------
// GAME LOGIC
// -----------------------------------------
function startGame() {
    state = "PLAYING";
    uiMenu.classList.remove('active');
    score = 0;
    lives = diffConfig[difficulty].maxLives;
    initPlayer();
    createLevel();
    updateHUD();
}

function resetGame() {
    state = "MENU";
    uiGameOver.classList.remove('active');
    uiWin.classList.remove('active');
    uiMenu.classList.add('active');
}

function updateHUD() {
    scoreDisplay.innerText = `SCORE: ${score.toString().padStart(6, '0')}`;
    livesDisplay.innerText = `LIVES: ${'*'.repeat(Math.max(0, lives))}`;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('retroMarioHighScore', highScore);
        highScoreDisplay.innerText = `HI: ${highScore.toString().padStart(6, '0')}`;
    }
}

function checkAutoDifficulty() {
    if (difficulty === "auto") {
        // Increase speed slightly every 500 points
        let scaleFactor = Math.floor(score / 500);
        let newSpeed = diffConfig.auto.enemySpeed + (scaleFactor * 0.5);
        
        enemies.forEach(e => {
            // Only update speed if it needs increasing to prevent slowing down if moving backwards
            if(Math.abs(e.speed) < newSpeed) {
                 e.speed = newSpeed;
            }
        });
    }
}

function update() {
    if (state !== "PLAYING") return;

    // --- Player Movement ---
    const isMovingLeft = keys.ArrowLeft || touchLeft;
    const isMovingRight = keys.ArrowRight || touchRight;
    const isJumping = keys.Space || touchJump;

    if (isMovingLeft) {
        player.vx -= ACCEL;
        player.facingRight = false;
    } else if (isMovingRight) {
        player.vx += ACCEL;
        player.facingRight = true;
    } else {
        player.vx *= FRICTION;
    }

    // Clamp X Speed
    if (Math.abs(player.vx) > MAX_SPEED) {
        player.vx = Math.sign(player.vx) * MAX_SPEED;
    }
    if (Math.abs(player.vx) < 0.1) player.vx = 0;

    // Gravity
    let currentGravity = GRAVITY * diffConfig[difficulty].gravMult;
    player.vy += currentGravity;

    // Jump Logic
    if (player.onGround) {
        player.coyoteTimer = COYOTE_TIME;
    } else {
        player.coyoteTimer = Math.max(0, player.coyoteTimer - 1);
    }
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - 1);

    if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
        player.vy = -JUMP_FORCE;
        player.onGround = false;
        player.coyoteTimer = 0;
        player.jumpBufferTimer = 0;
    }

    // Variable jump height
    if (!isJumping && player.vy < -JUMP_FORCE / 2) {
        player.vy = -JUMP_FORCE / 2;
    }

    // Apply Velocity
    player.x += player.vx;
    player.y += player.vy;

    // --- Collisions with Platforms ---
    player.onGround = false;
    for (let plat of platforms) {
        // AABB Collision check
        if (player.x < plat.x + plat.w && player.x + player.w > plat.x &&
            player.y < plat.y + plat.h && player.y + player.h > plat.y) {
            
            // Determine side of collision
            let overlapTop = (player.y + player.h) - plat.y;
            let overlapBottom = (plat.y + plat.h) - player.y;
            let overlapLeft = (player.x + player.w) - plat.x;
            let overlapRight = (plat.x + plat.w) - player.x;

            let minOverlap = Math.min(overlapTop, overlapBottom, overlapLeft, overlapRight);

            if (minOverlap === overlapTop && player.vy > 0) {
                player.y = plat.y - player.h;
                player.vy = 0;
                player.onGround = true;
            } else if (minOverlap === overlapBottom && player.vy < 0) {
                player.y = plat.y + plat.h;
                player.vy = 0;
            } else if (minOverlap === overlapLeft || minOverlap === overlapRight) {
                player.x -= player.vx;
                player.vx = 0;
            }
        }
    }

    // Map Boundaries
    if (player.x < 0) { player.x = 0; player.vx = 0; }
    if (player.y > HEIGHT + 100) {
        // Death by falling
        lives--;
        updateHUD();
        if (lives <= 0) {
            gameOver();
        } else {
            // Respawn slightly back
            player.x = Math.max(0, player.x - 300);
            player.y = HEIGHT - 150;
            player.vx = 0;
            player.vy = 0;
        }
    }

    // --- Camera Update ---
    let targetX = player.x - WIDTH / 2;
    cameraX += (targetX - cameraX) * 0.1;
    cameraX = Math.max(0, Math.min(cameraX, 3000 - WIDTH));

    // --- Enemies Update ---
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        e.x += e.speed * e.dir;

        // Platform edge detection
        let onEdge = true;
        for (let plat of platforms) {
            let nextX = e.x + (e.dir > 0 ? e.w : 0);
            if (nextX >= plat.x && nextX <= plat.x + plat.w &&
                Math.abs((e.y + e.h) - plat.y) < 5) {
                onEdge = false;
                break;
            }
        }

        if (onEdge || Math.abs(e.x - e.startX) > e.patrol) {
            e.dir *= -1;
        }

        // Enemy-Player Collision
        if (player.x < e.x + e.w && player.x + player.w > e.x &&
            player.y < e.y + e.h && player.y + player.h > e.y) {
            
            // Stomp
            if (player.vy > 0 && player.y + player.h - player.vy <= e.y + 10) {
                score += 200;
                player.vy = -JUMP_FORCE * 0.7; // Bounce
                spawnParticles(e.x + e.w/2, e.y + e.h/2, 10);
                enemies.splice(i, 1);
                updateHUD();
                checkAutoDifficulty();
            } else {
                // Hit
                lives--;
                spawnParticles(player.x + player.w/2, player.y + player.h/2, 15, "red");
                updateHUD();
                
                if (lives <= 0) {
                    gameOver();
                } else {
                    player.x = Math.max(0, player.x - 200);
                    player.y = HEIGHT - 150;
                    player.vx = 0;
                    player.vy = 0;
                }
            }
        }
    }

    // --- Coins Update ---
    let time = Date.now() / 200;
    for (let c of coins) {
        if (!c.collected) {
            c.drawY = c.y + Math.sin(time + c.bobOffset) * 5;
            
            // Collision
            if (player.x < c.x + c.w && player.x + player.w > c.x &&
                player.y < c.drawY + c.h && player.y + player.h > c.drawY) {
                c.collected = true;
                score += 100;
                spawnParticles(c.x + c.w/2, c.drawY + c.h/2, 5, "yellow");
                updateHUD();
                checkAutoDifficulty();
            }
        }
    }

    // Win condition check (collected enough coins or reached end)
    let uncollected = coins.filter(c => !c.collected).length;
    if (uncollected === 0 || player.x > 2800) {
        winGame();
    }

    // --- Particles Update ---
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // Gravity
        p.life--;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function gameOver() {
    state = "GAMEOVER";
    finalScore.innerText = `SCORE: ${score}`;
    uiGameOver.classList.add('active');
}

function winGame() {
    state = "WON";
    winScore.innerText = `SCORE: ${score}`;
    uiWin.classList.add('active');
}

// -----------------------------------------
// RENDERING
// -----------------------------------------
function draw() {
    // Clear canvas
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (state === "MENU") return; // Let CSS handle the menu screen

    ctx.save();
    ctx.translate(-cameraX, 0);

    // Draw Platforms
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    for (let p of platforms) {
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        // Add some inner line detail for retro feel
        ctx.beginPath();
        ctx.moveTo(p.x + 4, p.y + 4);
        ctx.lineTo(p.x + p.w - 4, p.y + 4);
        ctx.stroke();
    }

    // Draw Coins
    for (let c of coins) {
        if (!c.collected) {
            ctx.beginPath();
            ctx.arc(c.x + c.w/2, c.drawY + c.h/2, c.w/2, 0, Math.PI * 2);
            ctx.stroke();
            // Inner dot
            ctx.fillRect(c.x + c.w/2 - 1, c.drawY + c.h/2 - 1, 2, 2);
        }
    }

    // Draw Enemies (Goomba style)
    for (let e of enemies) {
        ctx.beginPath();
        ctx.arc(e.x + e.w/2, e.y + e.h/2 + 2, e.w/2, 0, Math.PI, true);
        ctx.lineTo(e.x, e.y + e.h);
        ctx.lineTo(e.x + e.w, e.y + e.h);
        ctx.closePath();
        ctx.stroke();
        
        // Eyes
        ctx.fillStyle = "white";
        ctx.fillRect(e.x + 6, e.y + 8, 4, 4);
        ctx.fillRect(e.x + 15, e.y + 8, 4, 4);
    }

    // Draw Player
    if (lives > 0 || state === "WON") {
        ctx.fillStyle = "white";
        ctx.fillRect(player.x, player.y, player.w, player.h);
        
        // Eyes (direction based)
        ctx.fillStyle = "black";
        let eyeX = player.facingRight ? player.x + player.w - 10 : player.x + 4;
        ctx.fillRect(eyeX, player.y + 6, 6, 6);
        
        // Mouth
        ctx.fillRect(player.x + player.w/2 - 4, player.y + 18, 8, 3);
    }

    // Draw Particles
    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    }

    ctx.restore();
}

// Game Loop
let lastTime = 0;
function loop(timestamp) {
    // We can use timestamp for delta time if we want to decouple physics from framerate,
    // but for this retro style, fixed timestep is fine.
    
    update();
    draw();
    
    requestAnimationFrame(loop);
}

// Start the loop
requestAnimationFrame(loop);
