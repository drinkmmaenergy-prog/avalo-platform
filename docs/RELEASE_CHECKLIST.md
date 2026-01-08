# Avalo Release Checklist

This comprehensive checklist ensures smooth releases for Avalo across web and mobile platforms.

## Pre-Release Checklist

### Code Quality
- [ ] All tests passing (`npm test` in functions/)
- [ ] ESLint checks passing (`pnpm run lint`)
- [ ] No console.log or debugging statements in production code
- [ ] Code reviewed and approved
- [ ] All merge conflicts resolved
- [ ] Branch up to date with main/develop

### Security & Compliance
- [ ] No hardcoded API keys or secrets
- [ ] Environment variables properly configured
- [ ] Firebase Security Rules tested and deployed
- [ ] Stripe webhook endpoints verified
- [ ] GDPR compliance verified
- [ ] Privacy policy updated (if needed)
- [ ] Terms of service reviewed

### Configuration
- [ ] `app.json` version incremented
- [ ] `package.json` versions updated
- [ ] Build numbers incremented (iOS/Android)
- [ ] Deep link configurations tested
- [ ] Firebase config verified
- [ ] Analytics tracking configured

### Testing
- [ ] Manual QA completed on staging
- [ ] Critical user flows tested:
  - [ ] User registration/login
  - [ ] Profile creation
  - [ ] Chat functionality
  - [ ] Payment processing
  - [ ] Calendar/event booking
  - [ ] AI companions interaction
  - [ ] Push notifications
- [ ] Cross-browser testing (web)
- [ ] Device testing (iOS/Android)
- [ ] Performance benchmarks acceptable
- [ ] Memory leaks checked

## Web Deployment Checklist

### Pre-Deploy
- [ ] Web build successful locally (`pnpm --filter web build`)
- [ ] Next.js production build tested
- [ ] Environment variables set in Firebase
- [ ] CDN/caching strategy verified
- [ ] SSL certificates valid
- [ ] Domain DNS configured

### Deploy
- [ ] Functions built (`npm run build:functions`)
- [ ] Firebase Functions deployed (`firebase deploy --only functions`)
- [ ] Hosting deployed (`firebase deploy --only hosting:web`)
- [ ] Deployment successful (check Firebase console)
- [ ] Rollback plan prepared

### Post-Deploy
- [ ] Website accessible at production URL
- [ ] All pages loading correctly
- [ ] API endpoints responding
- [ ] WebSocket connections working
- [ ] Static assets loading (images, CSS, JS)
- [ ] SEO meta tags verified
- [ ] Analytics events firing
- [ ] Error tracking active (Firebase Crashlytics)

## Mobile Release Checklist

### Android

#### Pre-Build
- [ ] Version code incremented in `app.json`
- [ ] Version name updated
- [ ] App signing configured in EAS
- [ ] Google Play Console access verified
- [ ] Release notes prepared
- [ ] Screenshots updated (if needed)

#### Build
- [ ] Preview build tested (`eas build -p android --profile preview`)
- [ ] Internal build verified
- [ ] Production build initiated (`eas build -p android --profile production`)
- [ ] Build completed successfully
- [ ] AAB file downloaded and verified

#### Testing
- [ ] Internal testing completed
- [ ] Beta testing with test group
- [ ] Google Play Integrity checks passing
- [ ] Device compatibility verified
- [ ] Permissions working correctly
- [ ] Deep links tested
- [ ] Push notifications tested

#### Store Submission
- [ ] Release notes finalized
- [ ] Store listing updated
- [ ] Screenshots current
- [ ] Privacy policy link active
- [ ] Submit to internal testing track
- [ ] Graduate to beta (if applicable)
- [ ] Submit for production review
- [ ] Monitor review status

### iOS

#### Pre-Build
- [ ] Build number incremented in `app.json`
- [ ] Version number updated
- [ ] Apple certificates valid
- [ ] App Store Connect access verified
- [ ] Release notes prepared
- [ ] Screenshots updated (if needed)

#### Build
- [ ] Preview build tested (`eas build -p ios --profile preview`)
- [ ] Internal build verified
- [ ] Production build initiated (`eas build -p ios --profile production`)
- [ ] Build completed successfully
- [ ] IPA file downloaded and verified

#### Testing
- [ ] TestFlight testing completed
- [ ] Beta testing with test group
- [ ] App Attest checks passing
- [ ] Device compatibility verified (iPhone/iPad)
- [ ] Permissions working correctly
- [ ] Deep links tested
- [ ] Push notifications tested
- [ ] Universal links working

#### Store Submission
- [ ] App Store Connect metadata complete
- [ ] Release notes finalized
- [ ] Screenshots uploaded
- [ ] Privacy manifest verified
- [ ] Export compliance answered
- [ ] Submit for App Review
- [ ] Monitor review status
- [ ] Respond to review feedback (if any)

## Post-Release Checklist

### Monitoring (First 24 Hours)
- [ ] Monitor Firebase Crashlytics for crashes
- [ ] Check analytics for user activity
- [ ] Monitor error logs
- [ ] Review performance metrics
- [ ] Check payment processing
- [ ] Monitor API usage/costs
- [ ] Verify push notifications working
- [ ] Monitor user feedback

### Week 1
- [ ] Review crash-free rate
- [ ] Analyze user retention
- [ ] Monitor store reviews/ratings
- [ ] Track conversion rates
- [ ] Review customer support tickets
- [ ] Performance optimization if needed
- [ ] Hot-fix deployment (if critical issues)

### Communication
- [ ] Notify team of successful deployment
- [ ] Update status page (if applicable)
- [ ] Announce release on social media
- [ ] Send update email to users (if major release)
- [ ] Update changelog/release notes
- [ ] Document any issues encountered

## Rollback Procedure

If critical issues are discovered:

### Web Rollback
```bash
# Rollback to previous hosting deployment
firebase hosting:rollback --project=<project-id>

# Rollback functions if needed
firebase deploy --only functions --rollback
```

### Mobile Rollback
- **Android**: Use Google Play Console to halt rollout or rollback
- **iOS**: Use App Store Connect to halt phased release or remove from sale
- **Emergency**: Push hot-fix build with incremented version

## Emergency Contacts

- **Firebase Admin**: [Add contact]
- **Expo/EAS Support**: support@expo.dev
- **Google Play Support**: [Add contact]
- **Apple Developer Support**: [Add contact]
- **Stripe Support**: [Add contact]

## Release Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA Lead | | | |
| Product Manager | | | |
| DevOps | | | |

## Notes

Record any issues, observations, or lessons learned during this release:

---

**Release Date**: _______________  
**Release Version**: _______________  
**Release Type**: [ ] Major  [ ] Minor  [ ] Patch  [ ] Hotfix