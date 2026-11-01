import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { NotificationProvider } from '../src/context/NotificationContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { VolunteerSignInView } from '../src/views/VolunteerSignInView';
import { api } from '../src/services/api';

describe('Volunteer Sign In Render & Resilience Tests', () => {
  it('renders Volunteer Sign In when registration status is available', async () => {
    // Mock registration status success
    const originalGetStatus = api.auth.getRegistrationStatus;
    api.auth.getRegistrationStatus = async () => ({
      success: true,
      hasEvent: true,
      eventName: 'The General Assembly',
      eventId: 'event-ga-2026',
      volunteerRegistrationEnabled: true,
      volunteer: {
        isOpen: true,
        state: 'open',
        enabled: true,
        opensAt: '2026-09-25T19:15',
        closesAt: '2026-11-15T19:30',
        opensAtFormatted: '25 September',
        closesAtFormatted: '15 November'
      }
    } as any);

    try {
      const html = renderToString(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(VolunteerSignInView, {
              onNavigate: () => {},
              onSignInSuccess: () => {}
            })
          )
        )
      );

      assert.ok(html.includes('Volunteer Access'), 'Should render Volunteer Access title');
      assert.ok(html.includes('EMAIL ADDRESS'), 'Should render email field');
      assert.ok(html.includes('PASSWORD'), 'Should render password field');
      assert.ok(!html.includes('Something went wrong'), 'Must not render global error');
    } finally {
      api.auth.getRegistrationStatus = originalGetStatus;
    }
  });

  it('renders Volunteer Sign In when registration status is initially loading / empty', async () => {
    // Mock hanging or unresolved response
    const originalGetStatus = api.auth.getRegistrationStatus;
    api.auth.getRegistrationStatus = () => new Promise(() => {});

    try {
      const html = renderToString(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(VolunteerSignInView, {
              onNavigate: () => {},
              onSignInSuccess: () => {}
            })
          )
        )
      );

      assert.ok(html.includes('Volunteer Access'), 'Should render Volunteer Access title');
      assert.ok(html.includes('EMAIL ADDRESS'), 'Should render email field');
      assert.ok(!html.includes('Something went wrong'), 'Must not render global error');
    } finally {
      api.auth.getRegistrationStatus = originalGetStatus;
    }
  });

  it('renders Volunteer Sign In when registration status request fails / rejects', async () => {
    // Mock rejected response
    const originalGetStatus = api.auth.getRegistrationStatus;
    api.auth.getRegistrationStatus = async () => {
      throw new Error('Network failure or server restart');
    };

    try {
      const html = renderToString(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            NotificationProvider,
            null,
            React.createElement(VolunteerSignInView, {
              onNavigate: () => {},
              onSignInSuccess: () => {}
            })
          )
        )
      );

      assert.ok(html.includes('Volunteer Access'), 'Should render Volunteer Access title');
      assert.ok(html.includes('EMAIL ADDRESS'), 'Should render email field');
      assert.ok(!html.includes('Something went wrong'), 'Must not crash or render global error');
    } finally {
      api.auth.getRegistrationStatus = originalGetStatus;
    }
  });
});
