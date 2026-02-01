export interface DataRightsRequest {
    id: string;
    userId: string;
    type: 'ACCESS' | 'DELETE' | 'EXPORT' | 'RECTIFY';
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
    createdAt: any;
}
export interface AccountLifecycleEvent {
    userId: string;
    event: 'CREATED' | 'VERIFIED' | 'SUSPENDED' | 'DELETED';
    timestamp: any;
}
export type DataRightsType = 'ACCESS' | 'DELETE' | 'EXPORT' | 'RECTIFY';
