declare module '@point-of-sale/receipt-printer-encoder' {
  interface EncoderOptions {
    printerModel?: string;
    columns?: number;
    imageMode?: string;
  }

  interface RuleOptions {
    style?: 'single' | 'double';
    width?: number;
  }

  class ReceiptPrinterEncoder {
    constructor(options?: EncoderOptions);
    initialize(): this;
    align(value: 'left' | 'center' | 'right'): this;
    bold(value: boolean): this;
    size(width: number, height: number): this;
    line(value: string): this;
    newline(): this;
    image(image: unknown, width: number, height: number, algorithm?: string): this;
    rule(options?: RuleOptions): this;
    cut(): this;
    encode(): Uint8Array;
  }

  export default ReceiptPrinterEncoder;
}
