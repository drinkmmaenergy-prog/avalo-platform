import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment } from '../init';
import {
  Course,
  CourseModule,
  CoursePurchase,
  CourseProgress,
  CourseCertificate,
  CourseUploadRequest,
  ModuleUploadRequest,
  PurchaseRequest,
  CertificateRequest,
  QASessionRequest,
  ComplianceReportRequest,
  CourseComplianceReport
} from '../types/education.types';
import {
  performFullComplianceCheck,
  detectScamClaims,
  validateUpsell
} from '../middleware/educationCompliance';

export const uploadCourse = functions.https.onCall(async (data: CourseUploadRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'creator') {
    throw new functions.https.HttpsError('permission-denied', 'User must be a creator');
  }

  const complianceCheck = performFullComplianceCheck({
    title: data.title,
    description: data.description,
    shortDescription: data.shortDescription,
    category: data.category,
    price: data.price,
    targetAudience: data.targetAudience,
    learningObjectives: data.learningObjectives
  });

  if (!complianceCheck.passed) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Course failed compliance check: ${complianceCheck.violations.join(', ')}`
    );
  }

  const courseRef = db.collection('courses').doc();
  const userData = userDoc.data();

  const course: Partial<Course> = {
    id: courseRef.id,
    creatorId: userId,
    creatorName: userData?.name || 'Unknown Creator',
    creatorAvatar: userData?.avatar,
    title: data.title,
    description: data.description,
    shortDescription: data.shortDescription,
    category: data.category,
    price: data.price,
    currency: data.currency,
    duration: data.duration,
    level: data.level,
    language: data.language,
    status: 'pending_review',
    rating: 0,
    ratingCount: 0,
    enrollmentCount: 0,
    completionRate: 0,
    learningObjectives: data.learningObjectives,
    prerequisites: data.prerequisites,
    targetAudience: data.targetAudience,
    materials: [],
    hasQuizzes: false,
    hasCertificate: false,
    allowsQA: false,
    maxQASessionsPerMonth: 0,
    tags: [],
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
    complianceScore: complianceCheck.score,
    scamRiskScore: complianceCheck.scamRisk
  };

  await courseRef.set(course);

  return {
    success: true,
    courseId: courseRef.id,
    status: 'pending_review',
    complianceScore: complianceCheck.score,
    warnings: complianceCheck.warnings
  };
});

export const uploadCourseModule = functions.https.onCall(async (data: ModuleUploadRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const courseDoc = await db.collection('courses').doc(data.courseId).get();
  if (!courseDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Course not found');
  }

  const courseData = courseDoc.data() as Course;
  if (courseData.creatorId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'You are not the course creator');
  }

  const moduleRef = db.collection('courses').doc(data.courseId).collection('modules').doc();

  const module: Partial<CourseModule> = {
    id: moduleRef.id,
    courseId: data.courseId,
    title: data.title,
    description: data.description,
    order: data.order,
    duration: data.duration,
    contentText: data.contentText,
    attachments: [],
    hasQuiz: false,
    isPreview: data.isPreview,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };

  await moduleRef.set(module);

  return {
    success: true,
    moduleId: moduleRef.id
  };
});

export const purchaseCourse = functions.https.onCall(async (data: PurchaseRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid user ID');
  }

  const courseDoc = await db.collection('courses').doc(data.courseId).get();
  if (!courseDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Course not found');
  }

  const courseData = courseDoc.data() as Course;
  if (courseData.status !== 'published') {
    throw new functions.https.HttpsError('failed-precondition', 'Course is not available for purchase');
  }

  const existingPurchase = await db
    .collection('course_purchases')
    .where('userId', '==', userId)
    .where('courseId', '==', data.courseId)
    .where('status', '==', 'active')
    .get();

  if (!existingPurchase.empty) {
    throw new functions.https.HttpsError('already-exists', 'You already own this course');
  }

  const purchaseId = `${userId}_${data.courseId}`;
  const purchaseRef = db.collection('course_purchases').doc(purchaseId);

  const purchase: Partial<CoursePurchase> = {
    id: purchaseId,
    userId,
    courseId: data.courseId,
    courseName: courseData.title,
    creatorId: courseData.creatorId,
    amount: courseData.price,
    currency: data.currency,
    status: 'pending',
    paymentMethod: data.paymentMethod,
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    purchasedAt: serverTimestamp() as any,
    accessGrantedAt: serverTimestamp() as any
  };

  await db.runTransaction(async (transaction) => {
    transaction.set(purchaseRef, purchase);
    
    transaction.update(courseDoc.ref, {
      enrollmentCount: increment(1)
    });

    const progressRef = db.collection('course_progress').doc(purchaseId);
    const progress: Partial<CourseProgress> = {
      id: purchaseId,
      userId,
      courseId: data.courseId,
      completedModules: [],
      currentModuleId: '',
      progressPercentage: 0,
      totalTimeSpent: 0,
      quizScores: {},
      completed: false,
      startedAt: serverTimestamp() as any,
      lastAccessedAt: serverTimestamp() as any,
      certificateIssued: false
    };
    transaction.set(progressRef, progress);

    const creatorEarnings = courseData.price * 0.65;
    const avaloRevenue = courseData.price * 0.35;

    const earningsRef = db.collection('creator_earnings').doc(courseData.creatorId);
    transaction.set(earningsRef, {
      totalEarnings: increment(creatorEarnings),
      pendingEarnings: increment(creatorEarnings),
      lastUpdated: serverTimestamp()
    }, { merge: true });

    const revenueRef = db.collection('platform_revenue').doc('education');
    transaction.set(revenueRef, {
      totalRevenue: increment(avaloRevenue),
      courseSales: increment(1),
      lastUpdated: serverTimestamp()
    }, { merge: true });
  });

  return {
    success: true,
    purchaseId,
    transactionId: purchase.transactionId
  };
});

export const logCourseProgress = functions.https.onCall(async (data: {
  courseId: string;
  moduleId: string;
  completed: boolean;
  timeSpent: number;
  quizScore?: number;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const progressId = `${userId}_${data.courseId}`;

  const progressDoc = await db.collection('course_progress').doc(progressId).get();
  if (!progressDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Course progress not found. Purchase the course first.');
  }

  const progressData = progressDoc.data() as CourseProgress;
  const completedModules = [...progressData.completedModules];

  if (data.completed && !completedModules.includes(data.moduleId)) {
    completedModules.push(data.moduleId);
  }

  const modulesSnapshot = await db.collection('courses').doc(data.courseId).collection('modules').get();
  const totalModules = modulesSnapshot.size;
  const progressPercentage = (completedModules.length / totalModules) * 100;

  const updateData: Partial<CourseProgress> = {
    completedModules,
    currentModuleId: data.moduleId,
    progressPercentage,
    totalTimeSpent: progressData.totalTimeSpent + data.timeSpent,
    lastAccessedAt: serverTimestamp() as any
  };

  if (data.quizScore !== undefined) {
    updateData.quizScores = {
      ...progressData.quizScores,
      [data.moduleId]: data.quizScore
    };
  }

  if (progressPercentage === 100 && !progressData.completed) {
    updateData.completed = true;
    updateData.completedAt = serverTimestamp() as any;

    await db.collection('courses').doc(data.courseId).update({
      completionRate: increment(1)
    });
  }

  await db.collection('course_progress').doc(progressId).update(updateData);

  const learningProgressRef = db.collection('learning_progress').doc(userId);
  await learningProgressRef.set({
    totalLearningTime: increment(data.timeSpent),
    lastActivityDate: serverTimestamp(),
    xpPoints: increment(Math.floor(data.timeSpent / 60))
  }, { merge: true });

  return {
    success: true,
    progressPercentage,
    completed: updateData.completed || false
  };
});

export const issueCertificate = functions.https.onCall(async (data: CertificateRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid user ID');
  }

  const progressId = `${userId}_${data.courseId}`;
  const progressDoc = await db.collection('course_progress').doc(progressId).get();

  if (!progressDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Course progress not found');
  }

  const progressData = progressDoc.data() as CourseProgress;

  if (!progressData.completed) {
    throw new functions.https.HttpsError('failed-precondition', 'Course not completed');
  }

  if (progressData.certificateIssued) {
    throw new functions.https.HttpsError('already-exists', 'Certificate already issued');
  }

  const courseDoc = await db.collection('courses').doc(data.courseId).get();
  const courseData = courseDoc.data() as Course;

  if (!courseData.hasCertificate) {
    throw new functions.https.HttpsError('failed-precondition', 'Course does not offer certificates');
  }

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const certificateRef = db.collection('course_certificates').doc();
  const certificateNumber = `AVALO-EDU-${Date.now()}-${certificateRef.id.substr(0, 8).toUpperCase()}`;

  const certificate: Partial<CourseCertificate> = {
    id: certificateRef.id,
    userId,
    userName: userData?.name || 'Unknown User',
    courseId: data.courseId,
    courseName: courseData.title,
    creatorId: courseData.creatorId,
    creatorName: courseData.creatorName,
    completionDate: progressData.completedAt,
    issuedAt: serverTimestamp() as any,
    certificateNumber,
    digitalSignature: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`,
    verificationUrl: `https://avalo.app/verify-certificate/${certificateRef.id}`,
    skills: courseData.learningObjectives,
    finalScore: data.finalScore
  };

  await db.runTransaction(async (transaction) => {
    transaction.set(certificateRef, certificate);
    
    transaction.update(progressDoc.ref, {
      certificateIssued: true
    });

    const learningProgressRef = db.collection('learning_progress').doc(userId);
    transaction.set(learningProgressRef, {
      totalCoursesCompleted: increment(1),
      xpPoints: increment(100)
    }, { merge: true });
  });

  return {
    success: true,
    certificateId: certificateRef.id,
    certificateNumber,
    verificationUrl: certificate.verificationUrl
  };
});

export const createQASession = functions.https.onCall(async (data: QASessionRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.studentId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid student ID');
  }

  const purchaseId = `${userId}_${data.courseId}`;
  const purchaseDoc = await db.collection('course_purchases').doc(purchaseId).get();

  if (!purchaseDoc.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'You must purchase the course first');
  }

  const courseDoc = await db.collection('courses').doc(data.courseId).get();
  const courseData = courseDoc.data() as Course;

  if (!courseData.allowsQA) {
    throw new functions.https.HttpsError('failed-precondition', 'This course does not offer Q&A sessions');
  }

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const sessionRef = db.collection('qa_sessions').doc();

  const session = {
    id: sessionRef.id,
    courseId: data.courseId,
    studentId: userId,
    studentName: userData?.name || 'Unknown Student',
    coachId: courseData.creatorId,
    coachName: courseData.creatorName,
    question: data.question,
    status: 'pending',
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any
  };

  await sessionRef.set(session);

  return {
    success: true,
    sessionId: sessionRef.id
  };
});

export const submitComplianceReport = functions.https.onCall(async (data: ComplianceReportRequest, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  if (data.reporterId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid reporter ID');
  }

  const courseDoc = await db.collection('courses').doc(data.courseId).get();
  if (!courseDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Course not found');
  }

  const courseData = courseDoc.data() as Course;
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();

  const reportRef = db.collection('course_compliance_reports').doc();

  const report: Partial<CourseComplianceReport> = {
    id: reportRef.id,
    courseId: data.courseId,
    courseName: courseData.title,
    creatorId: courseData.creatorId,
    reporterId: userId,
    reporterName: userData?.name || 'Anonymous',
    violationType: data.violationType as any,
    description: data.description,
    evidence: data.evidence,
    severity: 'medium',
    status: 'pending',
    createdAt: serverTimestamp() as any
  };

  await reportRef.set(report);

  return {
    success: true,
    reportId: reportRef.id
  };
});

export const resolveEducationDisputes = functions.https.onCall(async (data: {
  reportId: string;
  action: 'approve' | 'reject' | 'suspend_course' | 'ban_creator';
  notes: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const reportDoc = await db.collection('course_compliance_reports').doc(data.reportId).get();
  if (!reportDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Report not found');
  }

  const reportData = reportDoc.data() as CourseComplianceReport;

  await db.runTransaction(async (transaction) => {
    transaction.update(reportDoc.ref, {
      status: 'resolved',
      reviewedBy: context.auth!.uid,
      reviewNotes: data.notes,
      actionTaken: data.action,
      resolvedAt: serverTimestamp()
    });

    if (data.action === 'suspend_course') {
      const courseRef = db.collection('courses').doc(reportData.courseId);
      transaction.update(courseRef, {
        status: 'archived'
      });
    }

    if (data.action === 'ban_creator') {
      const creatorRef = db.collection('users').doc(reportData.creatorId);
      transaction.update(creatorRef, {
        banned: true,
        banReason: 'Serious compliance violations in education content'
      });
    }
  });

  return {
    success: true,
    action: data.action
  };
});