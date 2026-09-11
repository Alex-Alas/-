/* =========================================================
   THREE CONFIG — must be evaluated before any colour is built.
   The retro shader lights and quantises in its own space, so three's
   colour management would convert every palette hex a second time and
   wash the whole sandbox out. Every module that creates a Color, a
   texture or a material imports this first.
   ========================================================= */
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;
