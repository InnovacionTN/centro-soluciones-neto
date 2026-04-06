import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
export const appConfig = {
    providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideAnimations(),
    ],
};
//# sourceMappingURL=app.config.js.map