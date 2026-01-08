/**
 * PACK 435 — Global Events Engine: Admin Dashboard - Events Overview
 * 
 * Main dashboard for monitoring all global events
 */

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface EventStats {
  totalEvents: number;
  activeEvents: number;
  totalRevenue: number;
  totalAttendees: number;
  safetyIncidents: number;
  fraudAlerts: number;
}

interface Event {
  eventId: string;
  title: string;
  type: string;
  organizerName: string;
  city: string;
  startTime: Date;
  currentParticipants: number;
  maxParticipants: number;
  status: string;
  totalRevenue: number;
  riskScore: number;
}

export const EventsOverview: React.FC = () => {
  const [stats, setStats] = useState<EventStats>({
    totalEvents: 0,
    activeEvents: 0,
    totalRevenue: 0,
    totalAttendees: 0,
    safetyIncidents: 0,
    fraudAlerts: 0,
  });
  
  const [events, setEvents] = useState<Event[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  
  useEffect(() => {
    // Subscribe to events
    const q = query(
      collection(db, 'events'),
      orderBy('startTime', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({
        eventId: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime?.toDate(),
      })) as Event[];
      
      setEvents(eventsData);
      
      // Calculate stats
      const activeEvents = eventsData.filter(e => e.status === 'live' || e.status === 'published').length;
      const totalRevenue = eventsData.reduce((sum, e) => sum + (e.totalRevenue || 0), 0);
      const totalAttendees = eventsData.reduce((sum, e) => sum + (e.currentParticipants || 0), 0);
      const safetyIncidents = eventsData.reduce((sum, e) => sum + (e.safetyIncidents || 0), 0);
      
      setStats({
        totalEvents: eventsData.length,
        activeEvents,
        totalRevenue,
        totalAttendees,
        safetyIncidents,
        fraudAlerts: 0, // Would fetch from fraud alerts collection
      });
    });
    
    return () => unsubscribe();
  }, []);
  
  const filteredEvents = events.filter(event => {
    if (filterStatus !== 'all' && event.status !== filterStatus) return false;
    if (filterType !== 'all' && event.type !== filterType) return false;
    return true;
  });
  
  return (
    <div className="events-overview">
      <h1>Global Events Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Events</h3>
          <p className="stat-value">{stats.totalEvents}</p>
        </div>
        
        <div className="stat-card">
          <h3>Active Events</h3>
          <p className="stat-value">{stats.activeEvents}</p>
        </div>
        
        <div className="stat-card">
          <h3>Total Revenue</h3>
          <p className="stat-value">${stats.totalRevenue.toLocaleString()}</p>
        </div>
        
        <div className="stat-card">
          <h3>Total Attendees</h3>
          <p className="stat-value">{stats.totalAttendees}</p>
        </div>
        
        <div className="stat-card alert">
          <h3>Safety Incidents</h3>
          <p className="stat-value">{stats.safetyIncidents}</p>
        </div>
        
        <div className="stat-card alert">
          <h3>Fraud Alerts</h3>
          <p className="stat-value">{stats.fraudAlerts}</p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="filters">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="live">Live</option>
          <option value="ended">Ended</option>
          <option value="cancelled">Cancelled</option>
        </select>
        
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="speed_dating">Speed Dating</option>
          <option value="creator_fan_event">Creator Events</option>
          <option value="professional_networking">Professional</option>
          <option value="open_meetup">Open Meetup</option>
        </select>
      </div>
      
      {/* Events Table */}
      <div className="events-table">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Type</th>
              <th>Organizer</th>
              <th>Location</th>
              <th>Date</th>
              <th>Attendees</th>
              <th>Revenue</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map(event => (
              <tr key={event.eventId}>
                <td>{event.title}</td>
                <td>{event.type}</td>
                <td>{event.organizerName}</td>
                <td>{event.city}</td>
                <td>{event.startTime?.toLocaleDateString()}</td>
                <td>{event.currentParticipants}/{event.maxParticipants}</td>
                <td>${event.totalRevenue?.toLocaleString() || 0}</td>
                <td>
                  <span className={`risk-badge risk-${getRiskLevel(event.riskScore)}`}>
                    {event.riskScore}
                  </span>
                </td>
                <td>
                  <span className={`status-badge status-${event.status}`}>
                    {event.status}
                  </span>
                </td>
                <td>
                  <button onClick={() => viewEventDetails(event.eventId)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function getRiskLevel(score: number): string {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function viewEventDetails(eventId: string): void {
  window.location.href = `/admin/events/${eventId}`;
}

export default EventsOverview;
