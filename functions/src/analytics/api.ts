import * as functions from 'firebase-functions';
import { db, auth } from '../init';

// Get analytics dashboard data for mobile/web
export const getAnalyticsDashboard = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get user role
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userData = userDoc.data()!;
    const isAdmin = userData.role === 'admin' || userData.role === 'analyst';
    const isCreator = userData.is_creator === true;

    // Get date range
    const days = parseInt(req.query.days as string) || 7;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const dashboard: any = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days
      }
    };

    // Admin dashboard - full analytics
    if (isAdmin) {
      // Get user KPIs
      const userKPIsSnapshot = await db.collection('analytics_daily')
        .where('metric_type', '==', 'user_kpis_summary')
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .get();

      dashboard.userKPIs = userKPIsSnapshot.docs.map(doc => doc.data().metrics);

      // Get chat monetization KPIs
      const chatKPIsSnapshot = await db.collection('analytics_daily')
        .where('metric_type', '==', 'chat_monetization_kpis')
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .get();

      dashboard.chatMonetization = chatKPIsSnapshot.docs.map(doc => doc.data().metrics);

      // Get calendar KPIs
      const calendarKPIsSnapshot = await db.collection('analytics_daily')
        .where('metric_type', '==', 'calendar_event_kpis')
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .get();

      dashboard.calendarEvents = calendarKPIsSnapshot.docs.map(doc => doc.data().metrics);

      // Get safety metrics
      const safetySnapshot = await db.collection('analytics_daily')
        .where('metric_type', '==', 'safety_monitoring')
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .get();

      dashboard.safetyMetrics = safetySnapshot.docs.map(doc => doc.data().metrics);

      // Get fraud metrics
      const fraudSnapshot = await db.collection('analytics_daily')
        .where('metric_type', '==', 'fraud_detection')
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .get();

      dashboard.fraudMetrics = fraudSnapshot.docs.map(doc => ({
        alerts: doc.data().alerts,
        riskDistribution: doc.data().risk_distribution
      }));

      // Get top creators
      const topCreatorsSnapshot = await db.collection('creator_metrics')
        .where('date', '==', endDate.toISOString().split('T')[0])
        .orderBy('exposureScore', 'desc')
        .limit(10)
        .get();

      dashboard.topCreators = topCreatorsSnapshot.docs.map(doc => ({
        creatorId: doc.id,
        ...doc.data()
      }));
    }

    // Creator dashboard - own metrics
    if (isCreator) {
      const creatorMetricsSnapshot = await db.collection('creator_metrics')
        .doc(userId)
        .collection('daily')
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'desc')
        .get();

      dashboard.creatorMetrics = creatorMetricsSnapshot.docs.map(doc => doc.data());

      // Get trends
      const trendsDoc = await db.collection('creator_metrics').doc(userId).get();
      if (trendsDoc.exists) {
        dashboard.trends = trendsDoc.data()?.trends_7d;
      }
    }

    // User personal analytics
    const userKPIsDoc = await db.collection('user_kpis').doc(userId).get();
    if (userKPIsDoc.exists) {
      dashboard.personalStats = userKPIsDoc.data();
    }

    res.status(200).json(dashboard);

  } catch (error) {
    console.error('Error fetching analytics dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get creator metrics (for creator's own dashboard)
export const getCreatorMetrics = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const creatorId = (req.query.creatorId as string) || userId;

    // Security: Only allow access to own metrics unless admin
    if (userId !== creatorId) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists || !['admin', 'analyst'].includes(userDoc.data()?.role)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    // Get daily metrics
    const metricsDoc = await db.collection('creator_metrics')
      .doc(creatorId)
      .collection('daily')
      .doc(date)
      .get();

    if (!metricsDoc.exists) {
      res.status(404).json({ error: 'Metrics not found for this date' });
      return;
    }

    res.status(200).json(metricsDoc.data());

  } catch (error) {
    console.error('Error fetching creator metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get safety alerts (admin only)
export const getSafetyAlerts = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'safety_moderator'].includes(userDoc.data()?.role)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const severity = req.query.severity as string;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.collection('safety_alerts')
      .where('requires_review', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (severity) {
      query = query.where('severity', '==', severity) as any;
    }

    const alertsSnapshot = await query.get();

    const alerts = alertsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ alerts });

  } catch (error) {
    console.error('Error fetching safety alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get fraud alerts (admin only)
export const getFraudAlerts = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'fraud_analyst'].includes(userDoc.data()?.role)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const riskLevel = req.query.riskLevel as string;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.collection('fraud_alerts')
      .where('requires_review', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (riskLevel) {
      query = query.where('severity', '==', riskLevel) as any;
    }

    const alertsSnapshot = await query.get();

    const alerts = alertsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ alerts });

  } catch (error) {
    console.error('Error fetching fraud alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get realtime dashboard metrics
export const getRealtimeMetrics = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check admin permissions
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !['admin', 'analyst'].includes(userDoc.data()?.role)) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Get today's metrics
    const [dauDoc, bookingsDoc, chatDoc, revenueDoc] = await Promise.all([
      db.collection('analytics_daily').doc(`dau_${today}`).get(),
      db.collection('analytics_daily').doc(`bookings_${today}`).get(),
      db.collection('analytics_daily').doc(`chats_${today}`).get(),
      db.collection('analytics_daily').doc(`revenue_${today}`).get()
    ]);

    const realtime = {
      activeUsers: dauDoc.exists ? (dauDoc.data()?.userIds?.length || 0) : 0,
      todayBookings: bookingsDoc.exists ? (bookingsDoc.data()?.booking_count || 0) : 0,
      todayChats: chatDoc.exists ? (chatDoc.data()?.total_chats || 0) : 0,
      todayRevenue: revenueDoc.exists ? (revenueDoc.data()?.total_revenue || 0) : 0,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(realtime);

  } catch (error) {
    console.error('Error fetching realtime metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});