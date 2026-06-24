const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Missing title or body' });
  }

  // Load environment variables
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VITE_VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !vapidPublicKey || !vapidPrivateKey) {
    return res.status(500).json({ 
      error: 'Backend is not fully configured with environment variables.' 
    });
  }

  try {
    // Configure Web Push
    webpush.setVapidDetails(
      'mailto:adithyanjayaraj2007@gmail.com',
      vapidPublicKey,
      vapidPrivateKey
    );

    // Initialize Supabase
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch active push subscriptions
    const { data: subscriptions, error: fetchErr } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (fetchErr) {
      console.error('Failed to fetch subscriptions from Supabase:', fetchErr);
      return res.status(500).json({ error: 'Failed to fetch subscriptions', details: fetchErr });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: true, message: 'No active subscriptions found.' });
    }

    const results = [];
    const invalidEndpoints = [];

    // Send push notification to each subscription
    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({ title, body })
        );
        results.push({ endpoint: sub.endpoint, status: 'success' });
      } catch (err) {
        console.error(`Failed to send push to ${sub.endpoint}:`, err);
        results.push({ endpoint: sub.endpoint, status: 'failed', error: err.message });
        
        // If subscription is expired or invalid (410 or 404), clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          invalidEndpoints.push(sub.endpoint);
        }
      }
    }

    // Clean up invalid subscriptions
    if (invalidEndpoints.length > 0) {
      const { error: deleteErr } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', invalidEndpoints);
        
      if (deleteErr) {
        console.warn('Failed to clean up expired subscriptions:', deleteErr);
      } else {
        console.log(`Cleaned up ${invalidEndpoints.length} expired subscriptions.`);
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Error in send-push API:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
