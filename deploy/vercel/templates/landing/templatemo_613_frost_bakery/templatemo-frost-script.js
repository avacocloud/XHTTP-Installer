/* 

JavaScript Document

TemplateMo 613 Frost Bakery

https://templatemo.com/tm-613-frost-bakery

*/

    (function () {
      'use strict';

      /* -------------------------------------------
         Mobile Menu Toggle
         ------------------------------------------- */
      const hamburger   = document.getElementById('hamburger');
      const sidebar     = document.getElementById('sidebar');
      const overlay     = document.getElementById('sidebarOverlay');
      const navLinks    = sidebar.querySelectorAll('.sidebar__nav a');

      function openMenu() {
        sidebar.classList.add('is-open');
        overlay.style.display = 'block';
        hamburger.classList.add('is-active');
        hamburger.setAttribute('aria-expanded', 'true');
        // Trigger reflow for transition
        requestAnimationFrame(function () {
          overlay.classList.add('is-visible');
        });
      }

      function closeMenu() {
        sidebar.classList.remove('is-open');
        overlay.classList.remove('is-visible');
        hamburger.classList.remove('is-active');
        hamburger.setAttribute('aria-expanded', 'false');
        setTimeout(function () {
          overlay.style.display = 'none';
        }, 300);
      }

      hamburger.addEventListener('click', function () {
        if (sidebar.classList.contains('is-open')) {
          closeMenu();
        } else {
          openMenu();
        }
      });

      overlay.addEventListener('click', closeMenu);

      // Close mobile menu when a nav link is clicked
      navLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth <= 1024) {
            closeMenu();
          }
        });
      });

      /* -------------------------------------------
         Active Navigation Highlighting on Scroll
         ------------------------------------------- */
      const sections = document.querySelectorAll('section[id]');

      function updateActiveNav() {
        var scrollY = window.scrollY + 120;

        sections.forEach(function (section) {
          var top    = section.offsetTop;
          var height = section.offsetHeight;
          var id     = section.getAttribute('id');

          if (scrollY >= top && scrollY < top + height) {
            navLinks.forEach(function (link) {
              link.classList.remove('active');
              if (link.getAttribute('href') === '#' + id) {
                link.classList.add('active');
              }
            });
          }
        });
      }

      window.addEventListener('scroll', updateActiveNav, { passive: true });

      /* -------------------------------------------
         Scroll-Triggered Reveal Animations
         (IntersectionObserver)
         ------------------------------------------- */
      var revealElements = document.querySelectorAll('.reveal');

      if ('IntersectionObserver' in window) {
        var revealObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              revealObserver.unobserve(entry.target);
            }
          });
        }, {
          threshold: 0.12,
          rootMargin: '0px 0px -40px 0px'
        });

        revealElements.forEach(function (el) {
          revealObserver.observe(el);
        });
      } else {
        // Fallback: show all elements immediately
        revealElements.forEach(function (el) {
          el.classList.add('is-visible');
        });
      }

      /* -------------------------------------------
         Smooth Scroll for Sidebar Links
         (enhanced for offset with sidebar)
         ------------------------------------------- */
      document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
          var target = document.querySelector(this.getAttribute('href'));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });


          }
        });
      });

      /* -------------------------------------------
         Seasonal Tabs
         ------------------------------------------- */
      var seasonTabs   = document.querySelectorAll('.seasonal-tab');
      var seasonPanels = document.querySelectorAll('.seasonal-panel');

      seasonTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          var season = this.getAttribute('data-season');

          // Update tabs
          seasonTabs.forEach(function (t) {
            t.classList.remove('is-active');
            t.setAttribute('aria-selected', 'false');
          });
          this.classList.add('is-active');
          this.setAttribute('aria-selected', 'true');

          // Update panels
          seasonPanels.forEach(function (panel) {
                      panel.classList.remove('is-active');
          });
          document.getElementById('panel-' + season).classList.add('is-active');
        });
      });

    })();