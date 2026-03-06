const express = require('express');
const router  = express.Router();
const { ConfidentialClientApplication } = require('@azure/msal-node');

const msalConfig = {
  auth: {
    clientId:     process.env.ENTRA_CLIENT_ID,
    authority:    `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`,
    clientSecret: process.env.ENTRA_CLIENT_SECRET
  }
};

let cca;
function getCCA() {
  if (!cca) cca = new ConfidentialClientApplication(msalConfig);
  return cca;
}

// GET /auth/login — redirect to Microsoft
router.get('/login', async (req, res) => {
  try {
    const authUrl = await getCCA().getAuthCodeUrl({
      scopes:      ['openid', 'profile', 'email'],
      redirectUri: process.env.ENTRA_REDIRECT_URI
    });
    res.redirect(authUrl);
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).send('Authentication configuration error. Check .env settings.');
  }
});

// GET /auth/callback — exchange code for token
router.get('/callback', async (req, res) => {
  try {
    const tokenResponse = await getCCA().acquireTokenByCode({
      code:        req.query.code,
      scopes:      ['openid', 'profile', 'email'],
      redirectUri: process.env.ENTRA_REDIRECT_URI
    });

    const email = tokenResponse.account.username || '';
    const name  = tokenResponse.account.name     || email;

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email.toLowerCase()) ? 'admin' : 'reader';

    req.session.user = { name, email, role };
    res.redirect('/');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.redirect('/auth/login');
  }
});

// GET /auth/logout — destroy session + redirect to Microsoft logout
router.get('/logout', (req, res) => {
  const tenantId   = process.env.ENTRA_TENANT_ID;
  const postLogout = encodeURIComponent(process.env.ENTRA_REDIRECT_URI.replace('/auth/callback', '/'));
  const logoutUrl  = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogout}`;

  req.session.destroy(() => res.redirect(logoutUrl));
});

module.exports = router;
