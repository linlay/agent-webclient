import './styles.css';
import { bootstrapApp } from './app/bootstrap.js';

bootstrapApp().catch((error) => {
  const status = document.getElementById('api-status');
  if (status) {
    status.textContent = `fatal: ${error.message}`;
    status.style.color = 'var(--danger)';
  }
});
