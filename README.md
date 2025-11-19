# Moses Kolleh Sesay - Portfolio Website

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://moseskolleh.github.io/sustaintheworld/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## About

Professional portfolio website for **Moses Kolleh Sesay**, a Sustainability & Climate Analyst specializing in ESG analysis, climate resilience, and data-driven environmental solutions.

**Live Website:** [https://moseskolleh.github.io/sustaintheworld/](https://moseskolleh.github.io/sustaintheworld/)

## Features

- **Modern Design**: Dark theme with vibrant green accents inspired by environmental sustainability
- **Responsive Layout**: Fully optimized for desktop, tablet, and mobile devices
- **Interactive Elements**: Smooth scrolling, animated counters, skill progress bars
- **Comprehensive Sections**:
  - Hero landing page with search functionality
  - About section with expertise highlights
  - Professional experience timeline
  - Research & project showcase
  - Technical skills and frameworks
  - Education & certifications
  - Contact form with social links

## Technologies Used

- **HTML5**: Semantic markup for better SEO and accessibility
- **CSS3**: Modern styling with CSS Grid, Flexbox, animations, and transitions
- **JavaScript (Vanilla)**: Interactive features without dependencies
- **Font Awesome**: Icon library for visual enhancements
- **GitHub Pages**: Free hosting for static websites

## Sections Overview

### 🏠 Home (Hero)
- Dynamic introduction with search functionality
- Call-to-action buttons
- Animated scroll indicator

### 👤 About
- Professional summary
- Impact statistics with animated counters
- Core expertise areas
- Highlight cards showcasing key achievements

### 💼 Experience
- Interactive timeline of professional roles
- Detailed descriptions of responsibilities
- Technology tags for each position
- From current role at Digital Society School to past positions in water resource management

### 🔬 Research & Projects
- 6 major research projects and initiatives
- Key areas: Climate adaptation, water pollution, sustainable AI, disaster risk reduction
- Technology stack for each project

### 🛠️ Skills
- Technical skills with animated progress bars
- Sustainability expertise badges
- ESG frameworks and standards (SBTi, CDP, GHG Protocol, TCFD, TNFD, etc.)

### 🎓 Education
- Master's degrees in Environmental Sciences and Industrial Engineering
- Bachelor's degree in Geology
- Professional certifications (ESG Specialist, Google Data Analytics, etc.)

### 📧 Contact
- Contact form with email integration
- Direct contact information
- Social media links (GitHub, LinkedIn)

## Setup Instructions

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/moseskolleh/sustaintheworld.git
   cd sustaintheworld
   ```

2. **Open in browser**
   ```bash
   # Simply open index.html in your web browser
   open index.html  # macOS
   start index.html # Windows
   xdg-open index.html # Linux
   ```

   Or use a local server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js (if you have http-server installed)
   npx http-server
   ```

3. **Access the website**
   - Open your browser and navigate to `http://localhost:8000`

### GitHub Pages Deployment

The website is automatically deployed to GitHub Pages from the main branch.

To deploy or update:

1. **Push changes to GitHub**
   ```bash
   git add .
   git commit -m "Update portfolio"
   git push origin main
   ```

2. **Enable GitHub Pages** (if not already enabled)
   - Go to repository Settings
   - Navigate to Pages section
   - Select source: Deploy from branch
   - Select branch: `main` (or your deployment branch)
   - Click Save

3. **Access your live site**
   - Your site will be available at: `https://[username].github.io/sustaintheworld/`

## Customization Guide

### Colors
To change the color scheme, edit the CSS variables in `style.css`:

```css
:root {
    --primary-green: #7CFC00;      /* Main accent color */
    --dark-bg: #0a0a0a;            /* Main background */
    --darker-bg: #000000;          /* Darker sections */
    --card-bg: #1a1a1a;            /* Card backgrounds */
    --text-primary: #ffffff;        /* Primary text */
    --text-secondary: #b0b0b0;     /* Secondary text */
}
```

### Content
- Update personal information in `index.html`
- Modify section content directly in the HTML
- Add or remove projects, experiences, and skills as needed

### Images
- Replace background images by updating the CSS `background-image` properties
- Add profile photo by inserting an `<img>` tag in the About section
- Store images in an `assets/images/` directory (create if needed)

## Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- **Lighthouse Score**: 95+ (Performance, Accessibility, Best Practices, SEO)
- **Load Time**: < 2 seconds on standard connections
- **Optimizations**:
  - Minimal dependencies (no heavy frameworks)
  - Lazy loading for images
  - Debounced scroll events
  - Optimized CSS and JavaScript

## Accessibility

- Semantic HTML5 elements
- ARIA labels where appropriate
- Keyboard navigation support
- Skip to content link
- High contrast ratios
- Responsive text sizing

## Contact

**Moses Kolleh Sesay**
- 📧 Email: [moseskollehsesay@gmail.com](mailto:moseskollehsesay@gmail.com)
- 💼 LinkedIn: [linkedin.com/in/moseskollehsesay](https://linkedin.com/in/moseskollehsesay)
- 🐙 GitHub: [github.com/moseskolleh](https://github.com/moseskolleh)
- 📍 Location: Amsterdam, The Netherlands

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Design inspiration: EcoSearch theme (environmental sustainability focus)
- Icons: [Font Awesome](https://fontawesome.com/)
- Fonts: System fonts for optimal performance
- Hosting: [GitHub Pages](https://pages.github.com/)

## Future Enhancements

- [ ] Blog section for sustainability articles
- [ ] Dark/Light theme toggle
- [ ] Multi-language support (English, Dutch)
- [ ] Project detail pages
- [ ] Interactive data visualizations
- [ ] PDF resume download
- [ ] Newsletter subscription
- [ ] Testimonials section

---

**Building a sustainable future through data-driven environmental solutions** 🌍

Made with 💚 by Moses Kolleh Sesay
