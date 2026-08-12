import './style.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const hud = document.querySelector<HTMLElement>('#hud');

if (!canvas || !hud) {
  throw new Error('Missing #game-canvas or #hud mount points');
}

const game = new Game(canvas, hud);
game.start();

// Helpful for manual debugging in Chromium DevTools
declare global {
  interface Window {
    __game?: Game;
  }
}
window.__game = game;
