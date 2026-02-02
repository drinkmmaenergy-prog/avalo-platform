/**
 * Victory Native Type Declarations
 * Provides type stubs for legacy victory-native API used in the app.
 * Victory-native v41+ changed its API but maintains runtime compatibility.
 */
declare module 'victory-native' {
  import { ComponentType } from 'react';

  export interface VictoryChartProps {
    theme?: any;
    height?: number;
    width?: number;
    domainPadding?: { x?: number; y?: number } | number;
    padding?: { top?: number; bottom?: number; left?: number; right?: number } | number;
    children?: React.ReactNode;
  }

  export interface VictoryAxisProps {
    tickFormat?: string[] | ((tick: any, index: number, ticks: any[]) => string);
    style?: any;
    dependentAxis?: boolean;
    tickValues?: any[];
  }

  export interface VictoryLineProps {
    data?: any[];
    x?: string | ((d: any) => any);
    y?: string | ((d: any) => any);
    style?: any;
    interpolation?: string;
  }

  export interface VictoryBarProps {
    data?: any[];
    x?: string | ((d: any) => any);
    y?: string | ((d: any) => any);
    style?: any;
    barWidth?: number;
    cornerRadius?: number | { top?: number; bottom?: number };
  }

  export interface VictoryPieProps {
    data?: any[];
    x?: string | ((d: any) => any);
    y?: string | ((d: any) => any);
    colorScale?: string[];
    innerRadius?: number;
    labels?: ((d: any) => string) | string[];
    labelRadius?: number;
    style?: any;
    width?: number;
    height?: number;
  }

  export const VictoryChart: ComponentType<VictoryChartProps>;
  export const VictoryAxis: ComponentType<VictoryAxisProps>;
  export const VictoryLine: ComponentType<VictoryLineProps>;
  export const VictoryBar: ComponentType<VictoryBarProps>;
  export const VictoryPie: ComponentType<VictoryPieProps>;
  export const VictoryTheme: {
    material: any;
    grayscale: any;
  };
}
