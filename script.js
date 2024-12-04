class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameOver = false;

        // Set canvas size
        this.canvas.width = 400;
        this.canvas.height = 600;

        // Monkey properties
        this.monkey = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 100,
            width: 50,
            height: 50,
            swinging: false,
            isGrounded: false
        };

        // Blocks array
        this.blocks = [];

        // Event listeners
        this.canvas.addEventListener('mousedown', this.startPull.bind(this));
        this.canvas.addEventListener('mousemove', this.updatePull.bind(this));
        this.canvas.addEventListener('mouseup', this.releasePull.bind(this));
        document.getElementById('restart-btn').addEventListener('click', this.restart.bind(this));

        // Load sprites
        this.sprites = {
            monkey: new Image(),
            block: new Image(),
            fence: new Image(),
            background: new Image()
        };

        this.sprites.monkey.src = 'assets/monkey.png';
        this.sprites.block.src = 'assets/block.png';
        this.sprites.fence.src = 'assets/fence.png';
        this.sprites.background.src = 'assets/background.png';

        // Wait for all sprites to load
        Promise.all([
            this.loadImage(this.sprites.monkey),
            this.loadImage(this.sprites.block),
            this.loadImage(this.sprites.fence),
            this.loadImage(this.sprites.background)
        ]).then(() => {
            this.gameLoop();
        });

        // Add new properties for pull mechanics
        this.pullStart = { x: 0, y: 0 };
        this.pullCurrent = { x: 0, y: 0 };
        this.pullStrength = 0;
        this.maxPullStrength = 80; // Further reduced for more precise control
        this.monkeyVelocity = { x: 0, y: 0 };
        this.gravity = 0.3;
        this.jumpMultiplier = 0.15; // Reduced for more controlled jumps
        this.horizontalMultiplier = 0.3;
        
        // Add block height constants
        this.blockSpacing = 100; // Vertical distance between blocks
        this.maxJumpHeight = this.blockSpacing * 3; // Maximum height = 3 blocks

        // Update event listeners
        this.canvas.addEventListener('mousedown', this.startPull.bind(this));
        this.canvas.addEventListener('mousemove', this.updatePull.bind(this));
        this.canvas.addEventListener('mouseup', this.releasePull.bind(this));
        
        // Add touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startPull(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.updatePull(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.releasePull(e);
        });

        // Add initial platform that acts as ground
        this.initialPlatform = {
            x: 0,
            y: this.canvas.height - 50,
            width: this.canvas.width,
            height: 50
        };

        // Add property to track last landed block
        this.lastLandedBlockIndex = 0;

        // Add camera properties
        this.camera = {
            y: 0,
            targetY: 0,
            smoothness: 0.1 // Controls how smoothly camera follows (0-1)
        };

        // Add property to track the bottom death line
        this.deathLine = this.canvas.height;

        // Add property to track if base block should be visible
        this.showBaseBlock = true;
        
        // Number of blocks to show ahead
        this.visibleBlocksAhead = 3;

        // Timer and score properties
        this.score = 0;
        this.isMoving = false;
        this.lastMoveTime = 0;
        this.idleTimer = 0;
        this.idleThreshold = 2000; // 2 seconds
        this.scoreDecreaseInterval = null;
        this.gameStarted = false;

        // Initialize score display
        this.scoreElement = document.getElementById('score-value');
        if (!this.scoreElement) {
            console.error('Score element not found! Make sure to add it to HTML.');
        }

        // Add property to track if monkey has passed second block
        this.passedSecondBlock = false;

        // Initialize blocks to fill the screen
        this.initializeBlocks();

        // Add sound system
        this.sounds = {
            background: new Audio('assets/sounds/background.mp3'),
            gameOver: new Audio('assets/sounds/gameover.mp3'),
            land: new Audio('assets/sounds/land.mp3'),
            pull: new Audio('assets/sounds/pull.mp3')
        };

        // Configure background music
        this.sounds.background.loop = true;
        this.sounds.background.volume = 0.5; // Adjust volume as needed

        // Start background music
        this.playBackgroundMusic();

        // Volume adjustments
        this.sounds.background.volume = 0.5;  // Background music at 50%
        this.sounds.gameOver.volume = 0.8;    // Game over sound at 80%
        this.sounds.land.volume = 0.6;        // Landing sound at 60%
        this.sounds.pull.volume = 0.7;        // Pull sound at 70%
    }

    initializeBlocks() {
        // Add first block
        this.addBlock(this.canvas.width / 2, this.canvas.height - 150);
        
        // Calculate how many blocks we need to fill the screen
        const screenHeight = this.canvas.height;
        const currentY = this.canvas.height - 150;
        
        // Keep adding blocks until we reach the top of the screen
        while (currentY - this.blocks.length * this.blockSpacing > 0) {
            const lastBlock = this.blocks[this.blocks.length - 1];
            this.addBlock(
                Math.random() * (this.canvas.width - 80), // Random x position
                lastBlock.y - this.blockSpacing // Consistent vertical spacing
            );
        }
    }

    updateScore() {
        if (this.scoreElement) {
            this.scoreElement.textContent = Math.floor(this.score);
        }
    }

    checkMovement() {
        const currentTime = Date.now();
        const isMovingNow = Math.abs(this.monkeyVelocity.x) > 0.1 || Math.abs(this.monkeyVelocity.y) > 0.1;

        if (isMovingNow) {
            // Monkey is moving
            if (!this.gameStarted) {
                this.gameStarted = true;
            }
            this.lastMoveTime = currentTime;
            this.score += 0.1; // Increment score while moving
            this.updateScore();

            // Clear decrease interval if exists
            if (this.scoreDecreaseInterval) {
                clearInterval(this.scoreDecreaseInterval);
                this.scoreDecreaseInterval = null;
            }
        } else if (this.monkey.isGrounded && this.gameStarted) {
            // Check idle time when grounded
            const idleTime = currentTime - this.lastMoveTime;
            
            if (idleTime >= this.idleThreshold && !this.scoreDecreaseInterval) {
                // Start decreasing score
                this.scoreDecreaseInterval = setInterval(() => {
                    if (this.score > 0) {
                        this.score = Math.max(0, this.score - 0.1);
                        this.updateScore();
                    }
                }, 100);
            }
        }
    }

    gameLoop() {
        if (!this.gameOver) {
            this.updateMonkeyPosition();
            this.updateCamera();
            this.checkCollision();
            this.checkMovement(); // Add movement check to game loop
            this.draw();
        }
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    endGame() {
        if (!this.gameOver) {
            // Stop background music
            this.sounds.background.pause();
            this.sounds.background.currentTime = 0;

            // Play game over sound
            this.sounds.gameOver.currentTime = 0;
            this.sounds.gameOver.play().catch(error => console.log("Audio play failed:", error));
        }

        this.gameOver = true;
        
        // Clear any score decrease intervals
        if (this.scoreDecreaseInterval) {
            clearInterval(this.scoreDecreaseInterval);
            this.scoreDecreaseInterval = null;
        }
        
        // Store final score before resetting
        const finalScore = Math.floor(this.score);
        
        // Reset score
        this.score = 0;
        this.updateScore(); // Update the main score display
        
        // Update final score in game over screen
        const finalScoreElement = document.getElementById('final-score');
        if (finalScoreElement) {
            finalScoreElement.textContent = finalScore;
        }
        
        // Show game over screen
        document.getElementById('game-over').classList.remove('hidden');
    }

    restart() {
        if (this.scoreDecreaseInterval) {
            clearInterval(this.scoreDecreaseInterval);
            this.scoreDecreaseInterval = null;
        }
        
        this.score = 0;
        this.gameStarted = false;
        this.lastMoveTime = 0;
        this.gameOver = false;
        this.blocks = [];
        this.monkey.x = this.canvas.width / 2;
        this.monkey.y = this.initialPlatform.y - this.monkey.height;
        this.monkeyVelocity = { x: 0, y: 0 };
        this.camera = { y: 0, targetY: 0, smoothness: 0.1 };
        this.deathLine = this.canvas.height;
        this.showBaseBlock = true;
        this.initializeBlocks();
        document.getElementById('game-over').classList.add('hidden');
        this.updateScore();
        this.passedSecondBlock = false;  // Reset the second block tracking
        this.showBaseBlock = true;

        // Restart background music
        this.sounds.background.currentTime = 0;
        this.sounds.background.play().catch(error => console.log("Audio play failed:", error));
    }

    loadImage(img) {
        return new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
        });
    }

    addBlock(x, y) {
        const minDistance = 60;
        const previousBlock = this.blocks[this.blocks.length - 1];
        
        if (previousBlock) {
            // Ensure new block isn't too far horizontally
            const maxHorizontalDistance = 150;
            x = Math.max(minDistance, Math.min(this.canvas.width - 80, x));
            
            // Adjust x position to be within reachable distance
            const distanceFromPrevious = Math.abs(x - previousBlock.x);
            if (distanceFromPrevious > maxHorizontalDistance) {
                x = previousBlock.x + (x > previousBlock.x ? maxHorizontalDistance : -maxHorizontalDistance);
            }

            // Ensure vertical distance is consistent
            y = previousBlock.y - this.blockSpacing;
        }

        this.blocks.push({
            x: x,
            y: y,
            width: 80,
            height: 20,
            index: this.blocks.length
        });

        // Generate blocks ahead
        while (this.blocks.length < this.lastLandedBlockIndex + this.visibleBlocksAhead + 1) {
            const lastBlock = this.blocks[this.blocks.length - 1];
            this.addBlock(
                Math.random() * (this.canvas.width - 80),
                lastBlock.y - this.blockSpacing
            );
        }

        // Remove blocks that are too far below
        const lowestVisibleY = this.monkey.y + this.canvas.height / 2;
        this.blocks = this.blocks.filter(block => block.y < lowestVisibleY);
    }

    startPull(e) {
        if (!this.gameOver) {
            const rect = this.canvas.getBoundingClientRect();
            this.pullStart.x = e.clientX - rect.left;
            this.pullStart.y = e.clientY - rect.top;
            this.pullCurrent = {...this.pullStart};
            this.monkey.swinging = true;
        }
    }

    updatePull(e) {
        if (this.monkey.swinging && !this.gameOver) {
            const rect = this.canvas.getBoundingClientRect();
            this.pullCurrent.x = e.clientX - rect.left;
            this.pullCurrent.y = e.clientY - rect.top;
        }
    }

    releasePull(e) {
        if (this.monkey.swinging && !this.gameOver) {
            // Play pull sound when releasing
            this.sounds.pull.currentTime = 0;
            this.sounds.pull.play().catch(error => console.log("Audio play failed:", error));
            
            // Calculate pull direction and strength
            const dx = this.pullStart.x - this.pullCurrent.x;
            const dy = this.pullStart.y - this.pullCurrent.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Normalize and limit the pull strength
            let pullStrength = Math.min(distance, this.maxPullStrength);
            
            // Limit vertical movement to 3 blocks
            const verticalPull = Math.abs(dy);
            if (verticalPull > this.maxJumpHeight) {
                const ratio = this.maxJumpHeight / verticalPull;
                pullStrength *= ratio;
            }
            
            const strengthFactor = pullStrength / this.maxPullStrength;
            
            // Calculate velocities with height limit
            this.monkeyVelocity.x = dx * strengthFactor * this.horizontalMultiplier;
            let verticalVelocity = -Math.abs(dy * strengthFactor * this.jumpMultiplier);
            
            // Ensure vertical velocity doesn't exceed 3-block jump
            const maxVerticalVelocity = -Math.sqrt(2 * this.gravity * this.maxJumpHeight);
            this.monkeyVelocity.y = Math.max(verticalVelocity, maxVerticalVelocity);
            
            this.monkey.swinging = false;
            
            // Generate new block within reachable height
            this.addBlock(
                Math.random() * (this.canvas.width - 80),
                this.blocks[this.blocks.length - 1].y - this.blockSpacing
            );
        }
    }

    updateMonkeyPosition() {
        const nextX = this.monkey.x + this.monkeyVelocity.x;
        const nextY = this.monkey.y + this.monkeyVelocity.y;

        // Update position based on velocity
        this.monkey.x = nextX;
        this.monkey.y = nextY;

        // Apply gravity with terminal velocity
        const terminalVelocity = 10;
        this.monkeyVelocity.y = Math.min(this.monkeyVelocity.y + this.gravity, terminalVelocity);

        // Apply friction
        this.monkeyVelocity.x *= 0.92;
        this.monkeyVelocity.y *= 0.98;

        // Keep monkey within bounds
        if (this.monkey.x < 10) {
            this.monkey.x = 10;
            this.endGame();
        }
        if (this.monkey.x + this.monkey.width > this.canvas.width - 10) {
            this.monkey.x = this.canvas.width - this.monkey.width - 10;
            this.endGame();
        }
    }

    updateCamera() {
        // Set camera target to follow monkey when it goes up
        if (this.monkey.y < this.canvas.height / 2) {
            this.camera.targetY = -(this.monkey.y - this.canvas.height / 2);
        }

        // Smooth camera movement
        const cameraDistance = this.camera.targetY - this.camera.y;
        this.camera.y += cameraDistance * this.camera.smoothness;

        // Update death line based on camera position
        this.deathLine = this.canvas.height - this.camera.y;
    }

    checkCollision() {
        // Check death by falling
        if (this.monkey.y > this.deathLine) {
            this.endGame();
            return;
        }

        // Check wall collision
        if (this.monkey.x < 0 || this.monkey.x + this.monkey.width > this.canvas.width) {
            this.endGame();
            return;
        }

        let onPlatform = false;
        let hitCeiling = false;
        let landedBlockIndex = -1;  // Track which block monkey landed on

        // Function to check block collision
        const checkBlockCollision = (block) => {
            // Get monkey edges
            const monkeyTop = this.monkey.y;
            const monkeyBottom = this.monkey.y + this.monkey.height;
            const monkeyLeft = this.monkey.x;
            const monkeyRight = this.monkey.x + this.monkey.width;

            // Get block edges
            const blockTop = block.y;
            const blockBottom = block.y + block.height;
            const blockLeft = block.x;
            const blockRight = block.x + block.width;

            // Check if monkey is within block's horizontal bounds
            if (monkeyRight > blockLeft && monkeyLeft < blockRight) {
                // Check for bottom collision (monkey hitting head)
                if (monkeyTop <= blockBottom && monkeyTop >= blockTop && this.monkeyVelocity.y < 0) {
                    this.monkey.y = blockBottom;
                    this.monkeyVelocity.y = 0;
                    hitCeiling = true;
                }
                // Check for top collision (monkey landing)
                else if (monkeyBottom >= blockTop && monkeyBottom <= blockBottom && this.monkeyVelocity.y > 0) {
                    // Play land sound when monkey lands on a platform
                    this.sounds.land.currentTime = 0;
                    this.sounds.land.play().catch(error => console.log("Audio play failed:", error));
                    
                    this.monkey.y = blockTop - this.monkey.height;
                    this.monkeyVelocity.y = 0;
                    onPlatform = true;
                    landedBlockIndex = block.index;
                    return true;
                }
            }
            return false;
        };

        // Check collision with initial platform only if it's still showing
        if (this.showBaseBlock) {
            checkBlockCollision(this.initialPlatform);
        }

        // Check collision with blocks
        this.blocks.forEach(block => {
            checkBlockCollision(block);
        });

        // Check if monkey has reached second block
        if (landedBlockIndex >= 1 && !this.passedSecondBlock) {
            this.passedSecondBlock = true;
            this.showBaseBlock = false;
        }

        this.monkey.isGrounded = onPlatform;

        // If monkey falls below lowest block and base is hidden, end game
        if (!this.showBaseBlock && this.monkey.y > this.deathLine) {
            this.endGame();
            return;
        }

        // Apply gravity only if not on platform and not hitting ceiling
        if (!onPlatform && !this.monkey.swinging) {
            if (hitCeiling) {
                this.monkeyVelocity.y = Math.max(0, this.monkeyVelocity.y);
            }
            this.monkey.y += this.monkeyVelocity.y;
        }
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Save the current context state
        this.ctx.save();
        
        // Apply camera transform
        this.ctx.translate(0, this.camera.y);

        // Draw background
        this.ctx.drawImage(this.sprites.background, 0, -this.camera.y, this.canvas.width, this.canvas.height);

        // Draw electric fences
        this.ctx.drawImage(this.sprites.fence, 0, -this.camera.y, 10, this.canvas.height);
        this.ctx.drawImage(this.sprites.fence, this.canvas.width - 10, -this.camera.y, 10, this.canvas.height);

        // Draw initial platform only if it should be visible
        if (this.showBaseBlock) {
            const initialPlatformScreenY = this.initialPlatform.y + this.camera.y;
            if (initialPlatformScreenY < this.canvas.height + 100) {
                this.ctx.drawImage(
                    this.sprites.block,
                    this.initialPlatform.x,
                    this.initialPlatform.y,
                    this.initialPlatform.width,
                    this.initialPlatform.height
                );
            }
        }

        // Draw blocks
        this.blocks.forEach(block => {
            const blockScreenY = block.y + this.camera.y;
            if (blockScreenY < this.canvas.height + 100 && blockScreenY > -100) {
                this.ctx.drawImage(
                    this.sprites.block,
                    block.x,
                    block.y,
                    block.width,
                    block.height
                );
            }
        });

        // Draw monkey
        this.ctx.drawImage(
            this.sprites.monkey,
            this.monkey.x,
            this.monkey.y,
            this.monkey.width,
            this.monkey.height
        );

        // Draw pull line only when the monkey is swinging
        if (this.monkey.swinging) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.pullStart.x, this.pullStart.y - this.camera.y);
            this.ctx.lineTo(this.pullCurrent.x, this.pullCurrent.y - this.camera.y);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // Restore the context state
        this.ctx.restore();
    }

    gameLoop() {
        if (!this.gameOver) {
            this.updateMonkeyPosition();
            this.updateCamera();
            this.checkCollision();
            this.checkMovement(); // Add movement check to game loop
            this.draw();
        }
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    playBackgroundMusic() {
        // Start background music with user interaction
        document.addEventListener('click', () => {
            this.sounds.background.play().catch(error => console.log("Audio play failed:", error));
        }, { once: true });
    }
}

// Initialize game when page loads
window.onload = () => {
    new Game();
}; 