import { describe, expect, it } from 'vitest';
import { testConfig } from '../../test/fixtures';
import { UrlBuilder } from './url.builder';

describe('UrlBuilder', () => {
  it('builds share links against the web origin', () => {
    expect(new UrlBuilder(testConfig()).share('abc')).toBe('https://notes.example.com/abc');
  });

  it('builds asset links against the api origin', () => {
    expect(new UrlBuilder(testConfig()).asset('abc')).toBe(
      'https://api.example.com/v1/public/assets/abc',
    );
  });

  it('does not double a slash when the configured url has a trailing one', () => {
    const builder = new UrlBuilder(testConfig({ PUBLIC_WEB_URL: 'https://notes.example.com/' }));
    expect(builder.share('abc')).toBe('https://notes.example.com/abc');
  });
});
