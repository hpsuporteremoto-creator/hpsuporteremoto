import { bootstrapApplication } from '@angular/platform-browser';
import { clientConfig } from './app/client.config';
import { App } from './app/app';

bootstrapApplication(App, clientConfig).catch((err) => console.error(err));
