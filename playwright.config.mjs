import { defineConfig, devices } from '@playwright/test';
const custom=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:30000,
 reporter:'list',outputDir:'test-results',
 use:{baseURL:'http://127.0.0.1:8991',trace:'retain-on-failure',...(custom?{launchOptions:{executablePath:custom,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--disable-gpu']}}:{})},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:{command:'node tests/browser/fixture-server.mjs',url:'http://127.0.0.1:8991',reuseExistingServer:false,timeout:20000}
});
