import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  }

  signInWithSlack(redirectTo: string) {
    return this.client.auth.signInWithOAuth({
      provider: 'slack_oidc',
      options: { redirectTo },
    });
  }

  getSession() {
    return this.client.auth.getSession();
  }

  signOut() {
    return this.client.auth.signOut();
  }
}
