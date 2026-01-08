# Phase 29 Multi-Language - Quick Reference Guide

## 🚀 Quick Start for Developers

### 1. Use Translations in Any Screen

```typescript
import { useTranslation } from '../hooks/useTranslation';

function MyScreen() {
  const { t } = useTranslation();
  
  return (
    <View>
      <Text>{t('common.welcome')}</Text>
      <Button title={t('common.continue')} />
    </View>
  );
}
```

### 2. Use Translations with Variables

```typescript
const { t } = useTranslation();

// In strings.json: "greeting": "Hello {{name}}"
<Text>{t('greeting', { name: 'John' })}</Text>
```

### 3. Display Prices in Local Currency

```typescript
import { TokenPrice } from '../components/TokenPrice';

function PricingScreen() {
  return <TokenPrice baseUsdPrice={9.99} />;
}
```

### 4. Add Translatable User Content (Bios, Messages)

```typescript
import { TranslatableText } from '../components/TranslatableText';

function ProfileScreen({ profile }) {
  return (
    <TranslatableText
      text={profile.bio}
      type="bio"
      sourceLang={profile.language || 'en'}
      showToggle={true}
    />
  );
}
```

### 5. Access Locale Information

```typescript
import { useLocaleContext } from '../contexts/LocaleContext';

function MyScreen() {
  const { locale, region, currency, changeLocale } = useLocaleContext();
  
  return (
    <View>
      <Text>Current language: {locale}</Text>
      <Text>Region: {region}</Text>
      <Text>Currency: {currency}</Text>
    </View>
  );
}
```

---

## 📦 Available Translation Namespaces

### Common
```typescript
t('common.appName')        // "Avalo"
t('common.welcome')        // "Welcome"
t('common.continue')       // "Continue"
t('common.save')          // "Save"
t('common.cancel')        // "Cancel"
t('common.loading')       // "Loading..."
```

### Auth
```typescript
t('auth.signIn')          // "Sign In"
t('auth.signUp')          // "Sign Up"
t('auth.email')           // "Email"
t('auth.password')        // "Password"
```

### Onboarding
```typescript
t('onboarding.welcome')           // "Welcome to Avalo"
t('onboarding.getStarted')        // "Get Started"
t('onboarding.benefit1')          // "Safe & Verified Community"
```

### Profile
```typescript
t('profile.myProfile')    // "My Profile"
t('profile.editProfile')  // "Edit Profile"
t('profile.bio')          // "Bio"
t('profile.verified')     // "Verified"
```

### Chat
```typescript
t('chat.chats')           // "Chats"
t('chat.typeMessage')     // "Type a message..."
t('chat.sendMessage')     // "Send message"
```

### Tokens
```typescript
t('tokens.buyTokens')     // "Buy Tokens"
t('tokens.tokenBalance')  // "Token Balance"
t('tokens.price')         // "Price"
```

### Settings
```typescript
t('settings.settings')    // "Settings"
t('settings.language')    // "Language"
t('settings.notifications') // "Notifications"
```

---

## 🎨 Component Usage Examples

### Example 1: Simple Screen Translation

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from '../hooks/useTranslation';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  
  return (
    <View>
      <Text>{t('onboarding.welcome')}</Text>
      <Text>{t('onboarding.subtitle')}</Text>
      <TouchableOpacity>
        <Text>{t('onboarding.getStarted')}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Example 2: Profile with Translatable Bio

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { TranslatableText } from '../components/TranslatableText';
import { useTranslation } from '../hooks/useTranslation';

export default function ProfileScreen({ profile }) {
  const { t } = useTranslation();
  
  return (
    <View>
      <Text>{t('profile.bio')}</Text>
      <TranslatableText
        text={profile.bio}
        type="bio"
        sourceLang={profile.language}
      />
    </View>
  );
}
```

### Example 3: Chat with Translatable Messages

```typescript
import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { TranslatableText } from '../components/TranslatableText';

export default function ChatScreen({ messages }) {
  return (
    <FlatList
      data={messages}
      renderItem={({ item }) => (
        <View>
          <Text>{item.senderName}</Text>
          <TranslatableText
            text={item.text}
            type="message"
            sourceLang={item.language}
            context="casual chat"
          />
        </View>
      )}
    />
  );
}
```

### Example 4: Token Purchase with Local Pricing

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { TokenPrice } from '../components/TokenPrice';
import { useTranslation } from '../hooks/useTranslation';

export default function TokenPackagesScreen() {
  const { t } = useTranslation();
  
  const packages = [
    { tokens: 100, price: 4.99 },
    { tokens: 250, price: 9.99 },
    { tokens: 500, price: 19.99 },
  ];
  
  return (
    <View>
      <Text>{t('tokens.packages')}</Text>
      {packages.map((pkg) => (
        <View key={pkg.tokens}>
          <Text>{t('tokens.package1', { amount: pkg.tokens })}</Text>
          <TokenPrice baseUsdPrice={pkg.price} showApproximate={true} />
          <TouchableOpacity>
            <Text>{t('tokens.selectPackage')}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
```

### Example 5: Settings with Language Selector

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLocaleContext } from '../contexts/LocaleContext';
import { useTranslation } from '../hooks/useTranslation';
import { Locale } from '../hooks/useLocale';

export default function LanguageSettingsScreen() {
  const { locale, changeLocale } = useLocaleContext();
  const { t } = useTranslation();
  
  const handleChangeLanguage = async (newLocale: Locale) => {
    await changeLocale(newLocale);
  };
  
  return (
    <View>
      <Text>{t('settings.language')}</Text>
      
      <TouchableOpacity 
        onPress={() => handleChangeLanguage('en')}
        style={locale === 'en' ? styles.active : styles.inactive}
      >
        <Text>🇬🇧 English</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        onPress={() => handleChangeLanguage('pl')}
        style={locale === 'pl' ? styles.active : styles.inactive}
      >
        <Text>🇵🇱 Polski</Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

## 🔧 Adding New Translation Keys

### Step 1: Add to English JSON

Edit `app-mobile/i18n/strings.en.json`:

```json
{
  "myFeature": {
    "title": "My Feature",
    "description": "This is my new feature",
    "action": "Click here"
  }
}
```

### Step 2: Add to Polish JSON

Edit `app-mobile/i18n/strings.pl.json`:

```json
{
  "myFeature": {
    "title": "Moja funkcja",
    "description": "To jest moja nowa funkcja",
    "action": "Kliknij tutaj"
  }
}
```

### Step 3: Use in Code

```typescript
const { t } = useTranslation();

<Text>{t('myFeature.title')}</Text>
<Text>{t('myFeature.description')}</Text>
<Button title={t('myFeature.action')} />
```

---

## 🌍 Region & Currency Support

### Supported Regions

| Region | Countries | Currency | Symbol |
|--------|-----------|----------|--------|
| PL | Poland | PLN | zł |
| EU | Germany, France, Spain, Italy, etc. | EUR | € |
| UK | United Kingdom | GBP | £ |
| US | United States | USD | $ |
| OTHER | Rest of world | USD | $ |

### Get Display Price

```typescript
import { useLocaleContext } from '../contexts/LocaleContext';

function MyScreen() {
  const { getDisplayPrice } = useLocaleContext();
  
  const basePrice = 9.99; // USD
  const { amount, formatted } = getDisplayPrice(basePrice);
  
  return (
    <View>
      <Text>{formatted}</Text>
      <Text>Approximately ${basePrice.toFixed(2)} USD</Text>
    </View>
  );
}
```

---

## ⚠️ Important Rules

### DO:
✅ Use `t()` for all static UI text  
✅ Use `<TranslatableText>` for user-generated content  
✅ Use `<TokenPrice>` for pricing display  
✅ Add new keys to BOTH JSON files  
✅ Test language switching  

### DON'T:
❌ Modify token prices in backend  
❌ Change monetization logic  
❌ Hard-code currency symbols  
❌ Translate in Firebase Functions  
❌ Assume translation always succeeds  

---

## 🐛 Troubleshooting

### Translation Key Not Found
**Problem**: Warning in console: "Translation missing for key: xyz"  
**Solution**: Add the key to both `strings.en.json` and `strings.pl.json`

### Language Not Changing
**Problem**: Language stays the same after calling `changeLocale()`  
**Solution**: Make sure your component is wrapped in `<LocaleProvider>`

### Prices Not Showing in Local Currency
**Problem**: Prices still show in USD  
**Solution**: Use `<TokenPrice>` component instead of manual formatting

### Translation API Not Working
**Problem**: Translations fail or show original text  
**Solution**: Check API keys in `app.json` → `expo.extra`

---

## 📊 Translation Status Tracking

Use this checklist when adding translations to screens:

```markdown
## Screen Translation Checklist

- [ ] Import `useTranslation` hook
- [ ] Replace all hard-coded text with `t()` calls
- [ ] Add missing keys to both JSON files
- [ ] Test language switching
- [ ] Test with missing translations (fallback)
- [ ] Verify no layout issues with longer Polish text
```

---

## 🎯 Common Patterns

### Pattern 1: Form Fields
```typescript
<TextInput 
  placeholder={t('auth.email')}
  label={t('auth.email')}
/>
<TextInput 
  placeholder={t('auth.password')}
  label={t('auth.password')}
/>
```

### Pattern 2: Error Messages
```typescript
if (error) {
  Alert.alert(
    t('common.error'),
    t('errors.networkError')
  );
}
```

### Pattern 3: Success Messages
```typescript
Alert.alert(
  t('common.success'),
  t('tokens.purchaseSuccess')
);
```

### Pattern 4: Confirmation Dialogs
```typescript
Alert.alert(
  t('common.confirm'),
  t('profile.deleteAccount'),
  [
    { text: t('common.cancel') },
    { text: t('common.delete') }
  ]
);
```

---

## 🚀 Quick Command Reference

### Install Dependencies
```bash
cd app-mobile
npm install expo-localization
```

### Run Development
```bash
npm run ios     # iOS simulator
npm run android # Android emulator
```

### Add New Language
1. Create `i18n/strings.{lang}.json`
2. Update `Locale` type in `useLocale.ts`
3. Update `translations` in `useTranslation.ts`
4. Update language detection logic

---

## 📞 Need Help?

- **Documentation**: See `PHASE_29_MULTILANG_IMPLEMENTATION.md`
- **Translation Keys**: Check `i18n/strings.en.json`
- **Examples**: Look at `app/(onboarding)/welcome.tsx`
- **Components**: See `components/TranslatableText.tsx`

---

**Remember**: All changes are UI-only. Never modify backend monetization logic! 🔒