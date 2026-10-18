import { createHandler } from '../../server/handler.mjs';
export default createHandler();
export const config = {
  path: ['/admin', '/admin/*', '/api/*'],
  preferStatic: false,
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 120 }
};
