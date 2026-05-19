import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements } from 'ionicons/loader';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Registra os custom elements <ion-icon>. Os SVGs/chunks são copiados pra
// /ionicons/ no build (ver angular.json assets).
defineCustomElements(window, { resourcesUrl: '/ionicons/' });

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
