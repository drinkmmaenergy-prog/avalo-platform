declare module 'firebase-admin' {
;
;
  import * as _firebaseAdmin from 'firebase-admin';

  export = _firebaseAdmin;

  namespace firestore {
    export class Firestore {
      collection(collectionPath: string): CollectionReference;
      doc(documentPath: string): DocumentReference;
      batch(): WriteBatch;
      runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<T>;
      settings(settings: Settings): void;
    }

    export class CollectionReference {
      doc(documentPath?: string): DocumentReference;
      add(data: any): Promise<DocumentReference>;
      where(fieldPath: string, opStr: WhereFilterOp, value: any): Query;
      orderBy(fieldPath: string, directionStr?: OrderByDirection): Query;
      limit(limit: number): Query;
      get(): Promise<QuerySnapshot>;
    }

    export class DocumentReference {
      id: string;
      path: string;
      collection(collectionPath: string): CollectionReference;
      get(): Promise<DocumentSnapshot>;
      set(data: any, options?: SetOptions): Promise<WriteResult>;
      update(data: any): Promise<WriteResult>;
      delete(): Promise<WriteResult>;
    }

    export class DocumentSnapshot {
      id: string;
      ref: DocumentReference;
      exists: boolean;
      data(): any | undefined;
      get(fieldPath: string): any;
    }

    export class QuerySnapshot {
      docs: QueryDocumentSnapshot[];
      empty: boolean;
      size: number;
      forEach(callback: (result: QueryDocumentSnapshot) => void): void;
    }

    export class QueryDocumentSnapshot extends DocumentSnapshot {
      data(): any;
    }

    export class Query {
      where(fieldPath: string, opStr: WhereFilterOp, value: any): Query;
      orderBy(fieldPath: string, directionStr?: OrderByDirection): Query;
      limit(limit: number): Query;
      get(): Promise<QuerySnapshot>;
    }

    export class WriteBatch {
      set(documentRef: DocumentReference, data: any, options?: SetOptions): WriteBatch;
      update(documentRef: DocumentReference, data: any): WriteBatch;
      delete(documentRef: DocumentReference): WriteBatch;
      commit(): Promise<WriteResult[]>;
    }

    export class Transaction {
      get(documentRef: DocumentReference): Promise<DocumentSnapshot>;
      set(documentRef: DocumentReference, data: any, options?: SetOptions): Transaction;
      update(documentRef: DocumentReference, data: any): Transaction;
      delete(documentRef: DocumentReference): Transaction;
    }

    export class WriteResult {
      writeTime: Timestamp;
    }

    export class Timestamp {
      seconds: number;
      nanoseconds: number;
      toDate(): Date;
      toMillis(): number;
      static now(): Timestamp;
      static fromDate(date: Date): Timestamp;
      static fromMillis(milliseconds: number): Timestamp;
    }

    export class FieldValue {
      static serverTimestamp(): FieldValue;
      static delete(): FieldValue;
      static increment(n: number): FieldValue;
      static arrayUnion(...elements: any[]): FieldValue;
      static arrayRemove(...elements: any[]): FieldValue;
    }

    export type WhereFilterOp = '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'array-contains-any' | 'not-in';
    export type OrderByDirection = 'desc' | 'asc';
    export interface SetOptions {
      merge?: boolean;
      mergeFields?: string[];
    }
    export interface Settings {
      projectId?: string;
      timestampsInSnapshots?: boolean;
      ignoreUndefinedProperties?: boolean;
    }
  }
}


