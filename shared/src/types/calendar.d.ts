export interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    startTime: any;
    endTime: any;
    userId: string;
    type: string;
}
export interface CalendarSlot {
    startTime: any;
    endTime: any;
    available: boolean;
}
export type CalendarEventType = 'MEETING' | 'CALL' | 'DATE' | 'OTHER';
