/** Namespace and code constants. Node-free, so the browser core can import them. */
export const HREX = "http://hl7.org/fhir/us/davinci-hrex/StructureDefinition";
export const SYN = "https://imonfhir.com/ns/synthetic"; // a namespace URI, never fetched; neutral so requests carry no hint
export const POLICY = {
  sensitive: "http://hl7.org/fhir/us/davinci-hrex/StructureDefinition-hrex-consent.html#sensitive",
  regular: "http://hl7.org/fhir/us/davinci-hrex/StructureDefinition-hrex-consent.html#regular",
} as const;
