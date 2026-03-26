declare module "html-to-text" {
  export type ConvertSelector = {
    selector: string;
    format?: string;
    options?: {
      ignoreHref?: boolean;
    };
  };

  export type HtmlToTextOptions = {
    selectors?: ConvertSelector[];
    wordwrap?: false | number;
  };

  export function convert(value: string, options?: HtmlToTextOptions): string;
}
