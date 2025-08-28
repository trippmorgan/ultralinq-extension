// ultralinqCues.js (Your definitive version)
// A comprehensive map of all selectors, data paths, and patterns
// discovered during the debugging of the UltraLinq study viewer.
// This file is the single source of truth for scraping data.

export const ULTRALINQ_CUES = Object.freeze({
  // ===================================================================
  //  1. DOM Selectors (for finding HTML elements)
  // ===================================================================
  dom: {
    // --- For determining which view is active ---
    navigation: {
      selectedTab: '#studytabs .yui-nav .selected',
    },
    
    // --- For the Main Page & Top Info Bar (All Views) ---
    patientHeader: {
      container: '#studyinfo',
      patientName: '#studyinfo h1',
      infoBarLabelCell: '#studyinfo td.lab', // Added for label-based search
      dobLabel: 'DOB:',
      studyDateLabel: 'Study Date:',
    },

    // --- For the "Worksheet" View ---
    worksheet: {
      form: '#Echo_WorksheetSave',
      measurementsContainer: '#worksheet2content',
      measurementRow: '#worksheet2content tr',
      measurementLabelCell: 'td.k',
      measurementValueInput: "td.val input[type='text']",
      measurementUnitSpan: '.units',
      conclusionFieldset: 'fieldset', // Added
      conclusionLegend: 'legend',
      conclusionLegendText: 'Conclusions',
      summaryLegendText: 'Summary',
      findingTextarea: 'textarea.findingta',
    },

    // --- For the "Report" View ---
    report: {
      container: '#report2table',
      patientNameLabel: 'Patient Name:',
      dobLabel: 'DOB:',
      studyDateLabel: 'Date of Service:',
      tableCellWithLabel: 'td.k',
      summaryFindingsLabel: 'Summary Findings:',
      conclusionParagraph: 'td.conclusionsv p.rp',
      measurementsTable: 'table.includeauto', // A more generic table selector
      measurementsTableHeader: 'thead th',
      measurementsTableRow: 'tbody tr',
      measurementsTableCell: 'th,td',
      measurementsRightTableTitle: 'Right',
      measurementsLeftTableTitle: 'Left',
    },

    // --- For the iFrame containing the Image Viewer ---
    iframe: {
      selector: '#html5-embed',
    },
  },

  // ===================================================================
  //  2. JavaScript Data Paths (for accessing live JS variables)
  // ===================================================================
  js: {
    // The global object containing all image data.
    globalClipsObject: 'window.clips',
    // Property within clips object containing base64 data
    clipBase64Property: 'b64',
  },

  // ===================================================================
  //  3. String Literals & Patterns (for text matching and replacement)
  // ===================================================================
  patterns: {
    tabLabels: {
      report: 'Report',
      worksheet: 'Worksheet',
      clipsAndStills: 'Clips & Stills',
    },
  },
});