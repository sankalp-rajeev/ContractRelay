import { runWeatherLifecycle } from '../fixtures/synthetic/weather/lifecycle.js';

process.stdout.write(`${JSON.stringify(await runWeatherLifecycle('runs/local-demo'), null, 2)}\n`);
