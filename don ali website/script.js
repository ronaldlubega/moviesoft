// Rendering for homepage
function renderHomePage() {
  const heroSection = document.getElementById('heroSection');
  const moviesGrid = document.getElementById('moviesGrid');
  if (!heroSection || !moviesGrid) return;

  fetch('/api/movies')
    .then((res) => res.json())
    .then((movies) => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const term = searchInput.value.toLowerCase();
          const filtered = movies.filter((m) =>
            m.title.toLowerCase().includes(term)
          );
          renderMoviesGrid(filtered);
        });
      }

      const featured =
        movies.find((m) => m.featured) || (movies.length ? movies[0] : null);

      if (featured) {
        const posterUrl = featured.poster_path || featured.thumbnail || '';
        const videoUrl = featured.video_path || '';
        
        heroSection.innerHTML = `
          <div class="hero-left">
            <div class="hero-video">
              ${posterUrl ? `<img src="${posterUrl}" alt="${featured.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">` : ''}
              ${videoUrl ? `<video id="heroVideo" style="display: none; width: 100%; height: 100%; object-fit: cover; border-radius: 12px;" controls><source src="${videoUrl}" type="video/mp4"></video>` : ''}
              <div class="play-circle" ${videoUrl ? `onclick="document.getElementById('heroVideo').style.display = 'block'; document.getElementById('heroVideo').play(); this.style.display = 'none';"` : ''}>▶</div>
            </div>
          </div>
          <div class="hero-right">
            <h1 class="hero-title">${featured.title}</h1>
            <div class="hero-meta">
              ${featured.genres ? `<span>${featured.genres}</span>` : ''}
              ${featured.year ? `<span>${featured.year}</span>` : ''}
            </div>
            <p class="hero-description">${featured.description}</p>
            <div class="hero-actions">
              ${videoUrl ? `<button class="btn btn-primary" onclick="document.getElementById('heroVideo').style.display = 'block'; document.getElementById('heroVideo').play(); document.querySelector('.play-circle').style.display = 'none';">Watch Trailer</button>` : '<button class="btn btn-primary">Watch Trailer</button>'}
              <button class="btn btn-secondary">Add to Watchlist</button>
            </div>
          </div>
        `;
      } else {
        heroSection.innerHTML =
          '<p>No movies yet. Go to the admin page to add your first movie.</p>';
      }

      function renderMoviesGrid(list) {
        moviesGrid.innerHTML = '';
        list.forEach((movie) => {
          const card = document.createElement('div');
          card.className = 'movie-card';
          const posterUrl = movie.poster_path || movie.thumbnail || '';
          card.innerHTML = `
            <div class="movie-thumb">
              ${
                posterUrl
                  ? `<img src="${posterUrl}" alt="${movie.title}">`
                  : `<div class="movie-thumb-placeholder">${movie.title
                      .charAt(0)
                      .toUpperCase()}</div>`
              }
            </div>
            <div class="movie-info">
              <h4>${movie.title}</h4>
              ${movie.genres ? `<p class="genres">${movie.genres}</p>` : ''}
            </div>
          `;
          moviesGrid.appendChild(card);
        });
      }

      renderMoviesGrid(movies);
    })
    .catch((err) => {
      console.error('Failed to load movies from server', err);
      heroSection.innerHTML =
        '<p>Could not load movies. Make sure the Movie Soft server is running.</p>';
    });
}

// Admin page logic
function renderAdminPage() {
  const form = document.getElementById('movieForm');
  const listContainer = document.getElementById('adminMovieList');
  if (!form || !listContainer) return;

  function refreshList() {
    fetch('/api/movies')
      .then((res) => res.json())
      .then((movies) => {
        if (!movies.length) {
          listContainer.innerHTML = '<p>No movies saved yet.</p>';
          return;
        }

        listContainer.innerHTML = movies
          .map(
            (m) => `
          <div class="admin-movie-list-item">
            <div>
              <strong>${m.title}</strong>
              ${
                m.featured
                  ? '<span class="badge-featured">Featured</span>'
                  : ''
              }
            </div>
            <div>
              <button class="btn btn-outline btn-small" data-action="feature" data-id="${
                m.id
              }">Feature</button>
              <button class="btn btn-outline btn-small" data-action="delete" data-id="${
                m.id
              }">Delete</button>
            </div>
          </div>
        `
          )
          .join('');

        // Attach handlers
        listContainer
          .querySelectorAll('button[data-action="delete"]')
          .forEach((btn) =>
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              fetch(`/api/movies/${id}`, { method: 'DELETE' })
                .then(() => refreshList())
                .catch((err) =>
                  console.error('Failed to delete movie', err)
                );
            })
          );

        listContainer
          .querySelectorAll('button[data-action="feature"]')
          .forEach((btn) =>
            btn.addEventListener('click', () => {
              const id = btn.dataset.id;
              fetch(`/api/movies/${id}/feature`, { method: 'POST' })
                .then(() => refreshList())
                .catch((err) =>
                  console.error('Failed to feature movie', err)
                );
            })
          );
      })
      .catch((err) => {
        console.error('Failed to load movies for admin', err);
        listContainer.innerHTML =
          '<p>Could not load movies. Make sure the Movie Soft server is running.</p>';
      });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    
    // Note: FormData will automatically include file fields if files are selected
    // We need to ensure featured is sent as a string
    if (formData.get('featured')) {
      formData.set('featured', 'true');
    }

    fetch('/api/movies', {
      method: 'POST',
      body: formData, // Send FormData directly (don't set Content-Type header - browser will set it with boundary)
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then(err => Promise.reject(err));
        }
        return res.json();
      })
      .then(() => {
        form.reset();
        refreshList();
        alert('Movie saved to Movie Soft database!');
      })
      .catch((err) => {
        console.error('Failed to save movie', err);
        alert('Failed to save movie: ' + (err.error || 'Check console for details.'));
      });
  });

  refreshList();
}

document.addEventListener('DOMContentLoaded', () => {
  renderHomePage();
  renderAdminPage();

  const footerYear = document.getElementById('footerYear');
  if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
  }
});
