import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',timeout:300000,workers:1,use:{baseURL:'http://127.0.0.1:3000',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']}}});
