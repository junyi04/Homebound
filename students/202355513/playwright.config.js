import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  workers:1,
  timeout:45000,
  use:{baseURL:'http://127.0.0.1:8080',channel:'chrome',headless:true,viewport:{width:1440,height:1200},screenshot:'only-on-failure'},
  webServer:{command:'python app/server.py',url:'http://127.0.0.1:8080/health/ready',reuseExistingServer:!process.env.CI,timeout:15000,env:{DATA_DIR:'.local-data/browser-test',ADMIN_PASSWORD:'browser-test-admin'}}
});
