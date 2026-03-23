'use client';

/**
 * FIX 81 — Help Center Page (/help)
 *
 * FAQ categories with search, category filtering, expandable articles,
 * contact support form (via Cloud Function with Firestore fallback),
 * and user's own support tickets list.
 *
 * Backend: pack98-helpCenter, pack335-support-engine, pack335-support-ai, supportCenter
 * Cloud Functions: searchHelpArticles, createTicket, updateTicket, getMyHelpRequests
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

const FAQ_CATEGORIES = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting Started',
    titlePL: 'Pierwsze kroki',
    articles: [
      { q: 'How do I create a profile?', qPL: 'Jak stworzyć profil?', a: 'Go to Profile tab, click Edit Profile. Add at least 3 photos showing your face, fill in your bio, city, and interests.', aPL: 'Przejdź do zakładki Profil, kliknij Edytuj profil. Dodaj minimum 3 zdjęcia z Twoją twarzą, uzupełnij bio, miasto i zainteresowania.' },
      { q: 'How does matching work?', qPL: 'Jak działają dopasowania?', a: 'Like profiles you find interesting. When both people like each other, it\'s a Match! You get 4 free messages to start chatting.', aPL: 'Polub profile, które Cię interesują. Gdy obie osoby się polubią, to Match! Dostajecie 4 darmowe wiadomości na start.' },
      { q: 'What are tokens?', qPL: 'Czym są tokeny?', a: 'Tokens are Avalo\'s virtual currency. Buy them to send messages, unlock content, book meetings, and tip creators. Earn them by receiving messages, tips, and selling content.', aPL: 'Tokeny to wirtualna waluta Avalo. Kupuj je aby wysyłać wiadomości, odblokować treści, rezerwować spotkania i dawać napiwki. Zarabiaj je otrzymując wiadomości, napiwki i sprzedając treści.' },
    ]
  },
  {
    id: 'tokens-payments',
    icon: '💰',
    title: 'Tokens & Payments',
    titlePL: 'Tokeny i płatności',
    articles: [
      { q: 'How do I buy tokens?', qPL: 'Jak kupić tokeny?', a: 'Go to Wallet → Buy Tokens. Choose a pack and pay via Stripe (credit card). Tokens appear instantly.', aPL: 'Przejdź do Portfel → Kup tokeny. Wybierz pakiet i zapłać przez Stripe (karta). Tokeny pojawiają się natychmiast.' },
      { q: 'How do payouts work?', qPL: 'Jak działają wypłaty?', a: 'Earned tokens can be paid out at $0.03 USD per token. Go to Wallet → Payouts. Minimum 100 tokens. KYC verification required.', aPL: 'Zarobione tokeny można wypłacić po $0.03 USD za token. Przejdź do Portfel → Wypłaty. Minimum 100 tokenów. Wymagana weryfikacja KYC.' },
      { q: 'What are the earning splits?', qPL: 'Jakie są podziały zarobków?', a: 'Chat/Tips/Calls/Media/Live: you keep 65%, Avalo 35%. Subscriptions: 70/30. Calendar meetings/Events: 80/20.', aPL: 'Chat/Napiwki/Połączenia/Media/Live: Ty dostajesz 65%, Avalo 35%. Subskrypcje: 70/30. Spotkania/Wydarzenia: 80/20.' },
    ]
  },
  {
    id: 'safety',
    icon: '🛡️',
    title: 'Safety & Privacy',
    titlePL: 'Bezpieczeństwo',
    articles: [
      { q: 'How do I report someone?', qPL: 'Jak zgłosić kogoś?', a: 'On their profile, tap the ⋯ menu → Report User. Select a reason. Our team reviews all reports within 24 hours.', aPL: 'Na profilu osoby, kliknij menu ⋯ → Zgłoś użytkownika. Wybierz powód. Nasz zespół sprawdza wszystkie zgłoszenia w ciągu 24 godzin.' },
      { q: 'How do I block someone?', qPL: 'Jak zablokować kogoś?', a: 'On their profile, tap ⋯ → Block User. They won\'t be able to message you or see your profile.', aPL: 'Na profilu osoby, kliknij ⋯ → Zablokuj. Nie będą mogli do Ciebie pisać ani zobaczyć Twojego profilu.' },
      { q: 'How does meeting verification work?', qPL: 'Jak działa weryfikacja spotkań?', a: 'Calendar meetings use QR check-in. If the person doesn\'t match their photos, report mismatch within 15 minutes for a full refund.', aPL: 'Spotkania z kalendarza używają QR check-in. Jeśli osoba nie pasuje do zdjęć, zgłoś w ciągu 15 minut — pełny zwrot.' },
    ]
  },
  {
    id: 'earning',
    icon: '✨',
    title: 'Earning on Avalo',
    titlePL: 'Zarabianie na Avalo',
    articles: [
      { q: 'How do I start earning?', qPL: 'Jak zacząć zarabiać?', a: 'Go to Account → My Profile → Enable "Earn with Avalo". Toggle on the surfaces you want: Chat, Calls, Tips, Media, Live, Subscriptions, Meetings, Events.', aPL: 'Przejdź do Konto → Mój profil → Włącz "Zarabiaj z Avalo". Włącz powierzchnie: Chat, Połączenia, Napiwki, Media, Live, Subskrypcje, Spotkania, Wydarzenia.' },
      { q: 'What\'s the refund policy?', qPL: 'Jaka jest polityka zwrotów?', a: 'Undelivered services: full refund. Calendar: >72h = 100%, 24-72h = 50%, <24h = no refund. Emotional satisfaction and romantic expectations are NOT valid refund reasons.', aPL: 'Niedostarczone usługi: pełny zwrot. Kalendarz: >72h = 100%, 24-72h = 50%, <24h = brak. Emocjonalne oczekiwania i romantyczne nadzieje NIE są podstawą do zwrotu.' },
    ]
  },
];

export default function HelpPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketCategory, setTicketCategory] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState<any[]>([]);

  // Load user's support tickets
  useEffect(() => {
    if (!user?.uid) return;
    getDocs(query(collection(db, 'support_tickets'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')))
      .then(snap => setMyTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [user]);

  const handleSubmitTicket = async () => {
    if (!ticketSubject || !ticketMessage) { alert('Please fill in subject and message'); return; }
    setSubmitting(true);
    try {
      const fn = httpsCallable(functions, 'createTicket');
      await fn({ subject: ticketSubject, message: ticketMessage, category: ticketCategory });
      alert('Support ticket submitted! We\'ll respond within 24 hours.');
      setShowContactForm(false);
      setTicketSubject(''); setTicketMessage('');
    } catch {
      // Fallback: write directly to Firestore
      await addDoc(collection(db, 'support_tickets'), {
        userId: user!.uid,
        userEmail: user!.email || '',
        subject: ticketSubject,
        message: ticketMessage,
        category: ticketCategory,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      alert('Ticket submitted!');
      setShowContactForm(false);
    }
    setSubmitting(false);
  };

  // Filter articles by search
  const filteredCategories = searchQuery
    ? FAQ_CATEGORIES.map(cat => ({
        ...cat,
        articles: cat.articles.filter(a =>
          a.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.qPL.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.a.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(cat => cat.articles.length > 0)
    : selectedCategory
      ? FAQ_CATEGORIES.filter(c => c.id === selectedCategory)
      : FAQ_CATEGORIES;

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Help Center</h1>
      <p className="text-sm text-gray-500 mb-6">Find answers or contact support</p>

      {/* Search */}
      <div className="relative mb-6">
        <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSelectedCategory(null); }}
          placeholder="Search for help..." className="w-full p-3 pl-10 border rounded-xl text-sm" />
        <span className="absolute left-3 top-3.5 text-gray-400">🔍</span>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        <button onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${!selectedCategory ? 'bg-[#E4458F] text-white' : 'bg-gray-100'}`}>
          All Topics
        </button>
        {FAQ_CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${selectedCategory === cat.id ? 'bg-[#E4458F] text-white' : 'bg-gray-100'}`}>
            {cat.icon} {cat.titlePL}
          </button>
        ))}
      </div>

      {/* FAQ Articles */}
      {filteredCategories.map(cat => (
        <div key={cat.id} className="mb-6">
          <h2 className="font-semibold text-sm text-gray-600 mb-2">{cat.icon} {cat.titlePL}</h2>
          <div className="space-y-2">
            {cat.articles.map((article, i) => {
              const key = `${cat.id}-${i}`;
              return (
                <div key={key} className="border rounded-xl overflow-hidden">
                  <button onClick={() => setExpandedArticle(expandedArticle === key ? null : key)}
                    className="w-full p-3 text-left flex items-center justify-between hover:bg-gray-50">
                    <span className="text-sm font-medium">{article.qPL}</span>
                    <span className="text-gray-400">{expandedArticle === key ? '−' : '+'}</span>
                  </button>
                  {expandedArticle === key && (
                    <div className="px-3 pb-3 text-sm text-gray-600 border-t pt-2">
                      {article.aPL}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Contact Support */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl">
        <h3 className="font-semibold mb-2">Nie znalazłeś odpowiedzi?</h3>
        <p className="text-sm text-gray-500 mb-3">Napisz do nas — odpowiadamy w ciągu 24h.</p>
        {!showContactForm ? (
          <button onClick={() => setShowContactForm(true)}
            className="px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm">
            Napisz do supportu
          </button>
        ) : (
          <div className="space-y-3">
            <select value={ticketCategory} onChange={e => setTicketCategory(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm">
              <option value="general">General Question</option>
              <option value="payment">Payment / Tokens</option>
              <option value="account">Account Issue</option>
              <option value="safety">Safety Concern</option>
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
            </select>
            <input value={ticketSubject} onChange={e => setTicketSubject(e.target.value)}
              placeholder="Subject" className="w-full p-2 border rounded-lg text-sm" />
            <textarea value={ticketMessage} onChange={e => setTicketMessage(e.target.value)}
              placeholder="Describe your issue..." className="w-full p-2 border rounded-lg text-sm resize-none" rows={4} />
            <div className="flex gap-2">
              <button onClick={handleSubmitTicket} disabled={submitting}
                className="px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm disabled:opacity-50">
                {submitting ? 'Wysyłam...' : 'Wyślij'}
              </button>
              <button onClick={() => setShowContactForm(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg text-sm">Anuluj</button>
            </div>
          </div>
        )}
      </div>

      {/* My Tickets */}
      {myTickets.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-sm text-gray-600 mb-3">Moje zgłoszenia</h3>
          {myTickets.map(t => (
            <div key={t.id} className="p-3 border rounded-xl mb-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{t.subject}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  t.status === 'open' ? 'bg-yellow-100 text-yellow-700' :
                  t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>{t.status}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{t.message?.slice(0, 100)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
