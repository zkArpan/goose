import React, { useEffect, useRef, useState, useCallback } from 'react';

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Obstacle extends GameObject {
  type: 'cctv' | 'farmer' | 'book';
}

interface PowerUp extends GameObject {
  type: 'hat';
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const GAME_CONFIG = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 400,
  GROUND_Y: 300,
  GOOSE_WIDTH: 50,
  GOOSE_HEIGHT: 50,
  JUMP_VELOCITY: -12,
  GRAVITY: 0.6,
  GAME_SPEED: 4,
  OBSTACLE_SPAWN_RATE: 0.01,
  POWERUP_SPAWN_RATE: 0.003,
  SHIELD_DURATION: 5000,
  SCORE_MULTIPLIER_SHIELDED: 2,
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const gooseImageRef = useRef<HTMLImageElement | null>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameOver'>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('gooseRunnerHighScore');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Load goose GIF
  useEffect(() => {
    const img = new Image();
    img.src = '/goose_1fabf (1).gif';
    img.onload = () => {
      gooseImageRef.current = img;
    };
  }, []);

  // Game objects
  const gooseRef = useRef({
    x: 100,
    y: GAME_CONFIG.GROUND_Y - GAME_CONFIG.GOOSE_HEIGHT,
    width: GAME_CONFIG.GOOSE_WIDTH,
    height: GAME_CONFIG.GOOSE_HEIGHT,
    velocityY: 0,
    isJumping: false,
    isShielded: false,
    shieldEndTime: 0,
  });

  const gameDataRef = useRef({
    obstacles: [] as Obstacle[],
    powerUps: [] as PowerUp[],
    particles: [] as Particle[],
    gameSpeed: GAME_CONFIG.GAME_SPEED,
    lastObstacleSpawn: 0,
    lastPowerUpSpawn: 0,
    currentScore: 0,
    frameCount: 0,
  });

  // Sound effects using Web Audio API
  const playSound = useCallback((frequency: number, duration: number, type: 'jump' | 'powerup' | 'hit' = 'jump') => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (type === 'jump') {
        // Goose honk sound - quick frequency sweep
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, audioContext.currentTime + duration);
        oscillator.type = 'sawtooth';
      } else if (type === 'powerup') {
        // Power-up sound - ascending notes
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 2, audioContext.currentTime + duration);
        oscillator.type = 'sine';
      } else if (type === 'hit') {
        // Hit sound - harsh descending tone
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.3, audioContext.currentTime + duration);
        oscillator.type = 'square';
      }
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      // Silently fail if audio context is not supported
      console.log('Audio not supported');
    }
  }, []);

  const drawGoose = useCallback((ctx: CanvasRenderingContext2D, goose: typeof gooseRef.current) => {
    // Shield effect
    if (goose.isShielded) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(goose.x + goose.width/2, goose.y + goose.height/2, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw goose emoji flipped to face right
    ctx.save();
    
    // Add golden glow effect when shielded
    if (goose.isShielded) {
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    
    // Flip horizontally to face right
    ctx.scale(-1, 1);
    ctx.font = `${goose.width}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪿', -(goose.x + goose.width/2), goose.y + goose.height/2);
    
    ctx.restore();
  }, []);

  const drawObstacle = useCallback((ctx: CanvasRenderingContext2D, obstacle: Obstacle) => {
    ctx.font = `${obstacle.width}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    switch (obstacle.type) {
      case 'cctv':
        ctx.fillText('📹', obstacle.x + obstacle.width/2, obstacle.y + obstacle.height/2);
        break;
      
      case 'farmer':
        ctx.fillText('👨‍🌾', obstacle.x + obstacle.width/2, obstacle.y + obstacle.height/2);
        break;
      
      case 'book':
        ctx.fillText('📚', obstacle.x + obstacle.width/2, obstacle.y + obstacle.height/2);
        break;
    }
  }, []);

  const drawPowerUp = useCallback((ctx: CanvasRenderingContext2D, powerUp: PowerUp) => {
    if (powerUp.collected) return;
    
    // Glow effect
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(powerUp.x - 2, powerUp.y - 2, powerUp.width + 4, powerUp.height + 4);
    ctx.restore();
    
    // Draw hat emoji
    ctx.font = `${powerUp.width}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧢', powerUp.x + powerUp.width/2, powerUp.y + powerUp.height/2);
  }, []);

  const drawParticles = useCallback((ctx: CanvasRenderingContext2D, particles: Particle[]) => {
    particles.forEach(particle => {
      ctx.save();
      ctx.globalAlpha = particle.life / particle.maxLife;
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(particle.x, particle.y, 3, 3);
      ctx.restore();
    });
  }, []);

  const checkCollision = useCallback((obj1: GameObject, obj2: GameObject): boolean => {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
  }, []);

  const spawnObstacle = useCallback(() => {
    const types: Obstacle['type'][] = ['cctv', 'farmer', 'book'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    const obstacle: Obstacle = {
      x: GAME_CONFIG.CANVAS_WIDTH,
      y: GAME_CONFIG.GROUND_Y - 40,
      width: 35,
      height: 40,
      type,
    };

    if (type === 'book') {
      obstacle.width = 30;
      obstacle.height = 35;
    }

    gameDataRef.current.obstacles.push(obstacle);
  }, []);

  const spawnPowerUp = useCallback(() => {
    const powerUp: PowerUp = {
      x: GAME_CONFIG.CANVAS_WIDTH,
      y: GAME_CONFIG.GROUND_Y - 80,
      width: 30,
      height: 30,
      type: 'hat',
      collected: false,
    };

    gameDataRef.current.powerUps.push(powerUp);
  }, []);

  const createParticles = useCallback((x: number, y: number, count: number = 5) => {
    for (let i = 0; i < count; i++) {
      gameDataRef.current.particles.push({
        x: x + Math.random() * 20,
        y: y + Math.random() * 20,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 30,
        maxLife: 30,
      });
    }
  }, []);

  const jump = useCallback(() => {
    if (gameState === 'playing' && !gooseRef.current.isJumping) {
      gooseRef.current.velocityY = GAME_CONFIG.JUMP_VELOCITY;
      gooseRef.current.isJumping = true;
      playSound(300, 0.2, 'jump'); // Goose honk sound
    }
  }, [gameState]);

  const startGame = useCallback(() => {
    setGameState('playing');
    setScore(0);
    
    // Reset game objects
    gooseRef.current = {
      x: 100,
      y: GAME_CONFIG.GROUND_Y - GAME_CONFIG.GOOSE_HEIGHT,
      width: GAME_CONFIG.GOOSE_WIDTH,
      height: GAME_CONFIG.GOOSE_HEIGHT,
      velocityY: 0,
      isJumping: false,
      isShielded: false,
      shieldEndTime: 0,
    };

    gameDataRef.current = {
      obstacles: [],
      powerUps: [],
      particles: [],
      gameSpeed: GAME_CONFIG.GAME_SPEED,
      lastObstacleSpawn: 0,
      lastPowerUpSpawn: 0,
      currentScore: 0,
      frameCount: 0,
    };
  }, []);

  const gameOver = useCallback(() => {
    setGameState('gameOver');
    playSound(200, 0.5, 'hit'); // Game over sound
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('gooseRunnerHighScore', score.toString());
    }
  }, [score, highScore, playSound]);

  const gameLoop = useCallback(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameData = gameDataRef.current;
    const goose = gooseRef.current;
    
    gameData.frameCount++;

    // Clear canvas
    ctx.fillStyle = '#F7F7F7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw ground
    ctx.fillStyle = '#CCCCCC';
    ctx.fillRect(0, GAME_CONFIG.GROUND_Y, canvas.width, canvas.height - GAME_CONFIG.GROUND_Y);

    // Update goose physics
    goose.velocityY += GAME_CONFIG.GRAVITY;
    goose.y += goose.velocityY;

    if (goose.y >= GAME_CONFIG.GROUND_Y - goose.height) {
      goose.y = GAME_CONFIG.GROUND_Y - goose.height;
      goose.velocityY = 0;
      goose.isJumping = false;
    }

    // Check shield expiration
    if (goose.isShielded && Date.now() > goose.shieldEndTime) {
      goose.isShielded = false;
    }

    // Spawn obstacles
    if (Math.random() < GAME_CONFIG.OBSTACLE_SPAWN_RATE && 
        gameData.frameCount - gameData.lastObstacleSpawn > 120) {
      spawnObstacle();
      gameData.lastObstacleSpawn = gameData.frameCount;
    }

    // Spawn power-ups
    if (Math.random() < GAME_CONFIG.POWERUP_SPAWN_RATE && 
        gameData.frameCount - gameData.lastPowerUpSpawn > 300) {
      spawnPowerUp();
      gameData.lastPowerUpSpawn = gameData.frameCount;
    }

    // Update obstacles
    gameData.obstacles = gameData.obstacles.filter(obstacle => {
      obstacle.x -= gameData.gameSpeed;

      // Check collision with goose
      if (!goose.isShielded && checkCollision(goose, obstacle)) {
        gameOver();
        return true;
      }

      return obstacle.x > -obstacle.width;
    });

    // Update power-ups
    gameData.powerUps = gameData.powerUps.filter(powerUp => {
      if (powerUp.collected) return false;
      
      powerUp.x -= gameData.gameSpeed;

      // Check collection
      if (checkCollision(goose, powerUp)) {
        powerUp.collected = true;
        goose.isShielded = true;
        goose.shieldEndTime = Date.now() + GAME_CONFIG.SHIELD_DURATION;
        createParticles(powerUp.x, powerUp.y);
        playSound(400, 0.3, 'powerup'); // Power-up collection sound
        return false;
      }

      return powerUp.x > -powerUp.width;
    });

    // Update particles
    gameData.particles = gameData.particles.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life--;
      return particle.life > 0;
    });

    // Update score
    const multiplier = goose.isShielded ? GAME_CONFIG.SCORE_MULTIPLIER_SHIELDED : 1;
    gameData.currentScore += multiplier;
    setScore(Math.floor(gameData.currentScore / 10));

    // Increase game speed gradually
    gameData.gameSpeed = GAME_CONFIG.GAME_SPEED + (gameData.frameCount / 3600);

    // Draw everything
    drawGoose(ctx, goose);
    gameData.obstacles.forEach(obstacle => drawObstacle(ctx, obstacle));
    gameData.powerUps.forEach(powerUp => drawPowerUp(ctx, powerUp));
    drawParticles(ctx, gameData.particles);

    // Draw UI
    ctx.fillStyle = '#000000';
    ctx.font = '20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${score}`, 20, 40);
    ctx.fillText(`High: ${highScore}`, 20, 70);
    
    if (goose.isShielded) {
      ctx.fillStyle = '#FFD700';
      ctx.fillText('SHIELDED! 2X SCORE', 20, 100);
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, score, highScore, drawGoose, drawObstacle, drawPowerUp, drawParticles, 
      checkCollision, spawnObstacle, spawnPowerUp, createParticles, gameOver, playSound]);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        if (gameState === 'menu' || gameState === 'gameOver') {
          startGame();
        } else {
          jump();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, startGame, jump]);

  // Handle touch input
  useEffect(() => {
    const handleTouch = (event: TouchEvent) => {
      event.preventDefault();
      if (gameState === 'menu' || gameState === 'gameOver') {
        startGame();
      } else {
        jump();
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('touchstart', handleTouch);
      return () => canvas.removeEventListener('touchstart', handleTouch);
    }
  }, [gameState, startGame, jump]);

  // Start game loop
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    } else if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, gameLoop]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={GAME_CONFIG.CANVAS_WIDTH}
          height={GAME_CONFIG.CANVAS_HEIGHT}
          className="border-2 border-gray-400 rounded-lg shadow-lg bg-white cursor-pointer"
        />
        
        {gameState === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 rounded-lg">
            <div className="mb-4">
              <div className="text-6xl" style={{ transform: 'scaleX(-1)' }}>🪿</div>
            </div>
            <h1 className="text-4xl font-bold mb-4 text-gray-800">Goose Runner</h1>
            <p className="text-lg mb-6 text-center max-w-md text-gray-600">
              Help the goose escape! Jump over cameras, farmers, and books. 
              Collect hats for shields and bonus points!
            </p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-blue-500 text-white text-xl font-semibold rounded-lg hover:bg-blue-600 transition-colors"
            >
              Start Game
            </button>
            <p className="mt-4 text-sm text-gray-500">Press SPACEBAR or TAP to jump</p>
          </div>
        )}

        {gameState === 'gameOver' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90 rounded-lg">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-3xl font-bold mb-4 text-gray-800">Game Over!</h2>
            <p className="text-xl mb-2">Score: {score}</p>
            <p className="text-lg mb-6 text-gray-600">High Score: {highScore}</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-green-500 text-white text-xl font-semibold rounded-lg hover:bg-green-600 transition-colors"
            >
              Play Again
            </button>
            <p className="mt-4 text-sm text-gray-500">Press SPACEBAR or TAP to restart</p>
          </div>
        )}
      </div>

      <div className="mt-6 text-center max-w-2xl">
        <h3 className="text-lg font-semibold mb-2">How to Play</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div className="bg-white p-3 rounded-lg shadow">
            <div className="text-2xl mb-2">📹</div>
            <p><strong>CCTV Cameras</strong><br />Surveillance cameras - jump to avoid!</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow">
            <div className="text-2xl mb-2">👨‍🌾</div>
            <p><strong>Farmers</strong><br />Angry farmers blocking your path!</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow">
            <div className="text-2xl mb-2">📚</div>
            <p><strong>Ledger Books</strong><br />Heavy accounting books in your way!</p>
          </div>
        </div>
        <div className="mt-4 bg-yellow-100 p-3 rounded-lg">
          <div className="text-2xl mb-2">🧢</div>
          <p className="text-sm"><strong>Hat Power-up:</strong> Grants 5-second shield and 2x score multiplier!</p>
        </div>
      </div>
    </div>
  );
}

export default App;