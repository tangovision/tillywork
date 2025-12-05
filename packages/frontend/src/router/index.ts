import { createRouter, createWebHistory } from 'vue-router/auto';
import { routes } from 'vue-router/auto-routes';
import { requireAuthGuard, requireGuestGuard } from './guards';

// Create the router instance
const router = createRouter({
  history: createWebHistory(import.meta.env.TW_BASE_URL), // Using HTML5 history mode
  routes,
  scrollBehavior() {
    // always scroll to top
    return { top: 0 };
  },
});

router.beforeEach(requireAuthGuard);
router.beforeEach(requireGuestGuard);

export default router;
