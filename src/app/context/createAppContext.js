import { createElements } from './elements.js';
import { createState } from './state.js';

export function createAppContext() {
  return {
    state: createState(),
    elements: createElements(),
    services: {},
    ui: {},
    actions: {},
    handlers: {}
  };
}
