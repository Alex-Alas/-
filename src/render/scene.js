/* The scene graph root and its fog colour, kept apart from the renderer so
   that anything may add to the world without importing the render loop. */
import * as THREE from 'three';
import './three-config.js';

export const scene = new THREE.Scene();
export const FOG_COLOR = new THREE.Color(0x1b1430);
