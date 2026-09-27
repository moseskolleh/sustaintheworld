// html-validate for every page: `npm run lint:html`, part of `npm test`.
//
// A JavaScript config rather than .htmlvalidate.json because every
// relaxation below carries its reason, and html-validate reads JSON
// strictly: no comments, and rule options are schema-checked, so a reason
// has nowhere to go. Everything else in html-validate:recommended stands.
// A one-off exception belongs next to the element, as an
// `<!-- [html-validate-disable-next rule -- why] -->` comment.
module.exports = {
    root: true,
    extends: ['html-validate:recommended'],
    rules: {
        // The icon sprite hides itself inline (position, width, height,
        // overflow) so it takes no room even before or without a stylesheet,
        // and the first hero slide names its image inline so it paints with
        // the HTML. Any other property in a style attribute is still an error;
        // a custom property (the impact bar's --w) is data for the stylesheet,
        // and the rule lets it through.
        'no-inline-style': ['error', {
            allowedProperties: ['position', 'width', 'height', 'overflow', 'background-image']
        }],
        // A named box inside a section (a diagram or the evidence ledger that
        // scrolls sideways, the Assay's live verdict) stays a div with
        // role="region". A <section> is not a neutral box here: style.css
        // pads every one by 100px, and script.js's scroll-spy takes each
        // section with an id for a page section.
        'prefer-native-element': ['error', { exclude: ['region'] }]
    }
};
