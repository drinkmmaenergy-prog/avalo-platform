/**
 * Type declarations for optional @google-cloud/vision dependency
 */

declare module '@google-cloud/vision' {
  export class ImageAnnotatorClient {
    safeSearchDetection(image: string): Promise<any[]>;
  }
}