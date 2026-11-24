/**
 * Playlog Milestone Trophy & Achievement Engine
 * Personal media diary milestones for Movies/Series, Games, and Books.
 * Zero streaks (completion & quality focused).
 * Gamified hidden milestones: Locked achievements show title only with hidden secret tasks.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AppTrophies = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BADGES = [
    // -------------------------------------------------------------
    // MOVIES & SERIES MILESTONES (16 Milestones)
    // -------------------------------------------------------------
    {
      id: 'movie_first',
      category: 'movie',
      name: 'First Reel',
      desc: 'Log your first film or television season.',
      icon: '🎬',
      target: 1,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
        return { unlocked: count >= 1, current: Math.min(count, 1), target: 1 };
      }
    },
    {
      id: 'movie_10',
      category: 'movie',
      name: 'Double Feature',
      desc: 'Complete 10 movies or television seasons.',
      icon: '🍿',
      target: 10,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
        return { unlocked: count >= 10, current: Math.min(count, 10), target: 10 };
      }
    },
    {
      id: 'movie_25',
      category: 'movie',
      name: 'Quarter Century',
      desc: 'Complete 25 movies or series.',
      icon: '📽️',
      target: 25,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
        return { unlocked: count >= 25, current: Math.min(count, 25), target: 25 };
      }
    },
    {
      id: 'movie_50',
      category: 'movie',
      name: 'Silver Screen',
      desc: 'Log 50 films or television seasons.',
      icon: '🎞️',
      target: 50,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
        return { unlocked: count >= 50, current: Math.min(count, 50), target: 50 };
      }
    },
    {
      id: 'movie_100',
      category: 'movie',
      name: 'Century Club',
      desc: 'Reach a milestone library of 100 films & series.',
      icon: '🏛️',
      target: 100,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
        return { unlocked: count >= 100, current: Math.min(count, 100), target: 100 };
      }
    },
    {
      id: 'movie_250',
      category: 'movie',
      name: 'Archive Curator',
      desc: 'Curate a master archive of 250 films & series.',
      icon: '👑',
      target: 250,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
        return { unlocked: count >= 250, current: Math.min(count, 250), target: 250 };
      }
    },
    {
      id: 'movie_masterpiece',
      category: 'movie',
      name: 'Five-Star Taste',
      desc: 'Award 5 or more titles top ratings (4.5–5/5 or 9–10/10).',
      icon: '⭐',
      target: 5,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          if (e.type !== 'movie' && e.type !== 'series') return false;
          var r = Number(e.rating) || 0;
          return r >= 4.5;
        }).length;
        return { unlocked: count >= 5, current: Math.min(count, 5), target: 5 };
      }
    },
    {
      id: 'movie_flawless_10',
      category: 'movie',
      name: 'Flawless Score',
      desc: 'Award 10 titles a perfect 5/5 or 10/10 rating.',
      icon: '💎',
      target: 10,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          if (e.type !== 'movie' && e.type !== 'series') return false;
          var r = Number(e.rating) || 0;
          return r >= 5;
        }).length;
        return { unlocked: count >= 10, current: Math.min(count, 10), target: 10 };
      }
    },
    {
      id: 'movie_theatre',
      category: 'movie',
      name: 'The Big Screen',
      desc: 'Experience at least 3 movies in a movie theater.',
      icon: '🎟️',
      target: 3,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' && e.theatre; }).length;
        return { unlocked: count >= 3, current: Math.min(count, 3), target: 3 };
      }
    },
    {
      id: 'movie_theatre_buff',
      category: 'movie',
      name: 'Midnight Premiere',
      desc: 'Watch 10 or more films on the big screen in theatres.',
      icon: '🌃',
      target: 10,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'movie' && e.theatre; }).length;
        return { unlocked: count >= 10, current: Math.min(count, 10), target: 10 };
      }
    },
    {
      id: 'movie_director',
      category: 'movie',
      name: 'Auteur Devotee',
      desc: 'Watch 3 or more works by the same director.',
      icon: '🎥',
      target: 3,
      check: function (entries) {
        var dirs = {};
        (entries || []).forEach(function (e) {
          if ((e.type === 'movie' || e.type === 'series') && e.director) {
            dirs[e.director] = (dirs[e.director] || 0) + 1;
          }
        });
        var max = 0;
        Object.keys(dirs).forEach(function (d) { if (dirs[d] > max) max = dirs[d]; });
        return { unlocked: max >= 3, current: Math.min(max, 3), target: 3 };
      }
    },
    {
      id: 'movie_director_master',
      category: 'movie',
      name: 'Filmography Complete',
      desc: 'Watch 5 or more works by a single director.',
      icon: '🎩',
      target: 5,
      check: function (entries) {
        var dirs = {};
        (entries || []).forEach(function (e) {
          if ((e.type === 'movie' || e.type === 'series') && e.director) {
            dirs[e.director] = (dirs[e.director] || 0) + 1;
          }
        });
        var max = 0;
        Object.keys(dirs).forEach(function (d) { if (dirs[d] > max) max = dirs[d]; });
        return { unlocked: max >= 5, current: Math.min(max, 5), target: 5 };
      }
    },
    {
      id: 'movie_rewatch',
      category: 'movie',
      name: 'Encore Enthusiast',
      desc: 'Re-watch a beloved film or series.',
      icon: '🔁',
      target: 1,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          if (e.type !== 'movie' && e.type !== 'series') return false;
          return (e.rewatchCount && e.rewatchCount > 0) || (Array.isArray(e.rewatches) && e.rewatches.length > 0);
        }).length;
        return { unlocked: count >= 1, current: Math.min(count, 1), target: 1 };
      }
    },
    {
      id: 'movie_comfort_watch',
      category: 'movie',
      name: 'Comfort Watcher',
      desc: 'Record 5 or more re-watch sessions across your favorites.',
      icon: '☕',
      target: 5,
      check: function (entries) {
        var total = 0;
        (entries || []).forEach(function (e) {
          if (e.type === 'movie' || e.type === 'series') {
            if (Array.isArray(e.rewatches)) total += e.rewatches.length;
            else if (e.rewatchCount) total += Number(e.rewatchCount) || 0;
          }
        });
        return { unlocked: total >= 5, current: Math.min(total, 5), target: 5 };
      }
    },
    {
      id: 'movie_epic_runtime',
      category: 'movie',
      name: 'Epic Voyage',
      desc: 'Log 3 films with runtimes over 150 minutes (2.5+ hours).',
      icon: '⌛',
      target: 3,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'movie' && Number(e.runtime) >= 150;
        }).length;
        return { unlocked: count >= 3, current: Math.min(count, 3), target: 3 };
      }
    },
    {
      id: 'movie_series_binge',
      category: 'movie',
      name: 'Binge Pioneer',
      desc: 'Complete 5 television series seasons.',
      icon: '📺',
      target: 5,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'series';
        }).length;
        return { unlocked: count >= 5, current: Math.min(count, 5), target: 5 };
      }
    },

    // -------------------------------------------------------------
    // VIDEO GAMES MILESTONES (16 Milestones)
    // -------------------------------------------------------------
    {
      id: 'game_first',
      category: 'game',
      name: 'Press Start',
      desc: 'Complete or log your first video game.',
      icon: '🎮',
      target: 1,
      check: function (entries) {
        var count = (entries || []).filter(function (e) { return e.type === 'game'; }).length;
        return { unlocked: count >= 1, current: Math.min(count, 1), target: 1 };
      }
    },
    {
      id: 'game_5',
      category: 'game',
      name: 'Boss Defeated',
      desc: 'Complete 5 video games.',
      icon: '⚔️',
      target: 5,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && e.completionStatus === 'completed';
        }).length;
        return { unlocked: count >= 5, current: Math.min(count, 5), target: 5 };
      }
    },
    {
      id: 'game_15',
      category: 'game',
      name: 'Mid-Boss Conquered',
      desc: 'Complete 15 video games in your backlog.',
      icon: '🛡️',
      target: 15,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && e.completionStatus === 'completed';
        }).length;
        return { unlocked: count >= 15, current: Math.min(count, 15), target: 15 };
      }
    },
    {
      id: 'game_25',
      category: 'game',
      name: 'Seasoned Gamer',
      desc: 'Conquer and complete 25 games.',
      icon: '🏆',
      target: 25,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && e.completionStatus === 'completed';
        }).length;
        return { unlocked: count >= 25, current: Math.min(count, 25), target: 25 };
      }
    },
    {
      id: 'game_50',
      category: 'game',
      name: 'Master of Realms',
      desc: 'Complete 50 video games in your library.',
      icon: '👑',
      target: 50,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && e.completionStatus === 'completed';
        }).length;
        return { unlocked: count >= 50, current: Math.min(count, 50), target: 50 };
      }
    },
    {
      id: 'game_100',
      category: 'game',
      name: 'Legendary Hero',
      desc: 'Complete 100 video games in your lifetime backlog.',
      icon: '🌟',
      target: 100,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && e.completionStatus === 'completed';
        }).length;
        return { unlocked: count >= 100, current: Math.min(count, 100), target: 100 };
      }
    },
    {
      id: 'game_sink',
      category: 'game',
      name: 'Time Sink',
      desc: 'Dedicate 50+ hours into a single masterpiece game.',
      icon: '⏳',
      target: 50,
      check: function (entries) {
        var maxHours = 0;
        (entries || []).forEach(function (e) {
          if (e.type === 'game') {
            var h = Number(e.playtime) || 0;
            if (h > maxHours) maxHours = h;
          }
        });
        return { unlocked: maxHours >= 50, current: Math.min(Math.round(maxHours), 50), target: 50 };
      }
    },
    {
      id: 'game_century_single',
      category: 'game',
      name: 'Century Session',
      desc: 'Sink 100+ hours into a single massive world.',
      icon: '🌌',
      target: 100,
      check: function (entries) {
        var maxHours = 0;
        (entries || []).forEach(function (e) {
          if (e.type === 'game') {
            var h = Number(e.playtime) || 0;
            if (h > maxHours) maxHours = h;
          }
        });
        return { unlocked: maxHours >= 100, current: Math.min(Math.round(maxHours), 100), target: 100 };
      }
    },
    {
      id: 'game_marathon',
      category: 'game',
      name: 'Marathon Player',
      desc: 'Log over 100 total hours across your game collection.',
      icon: '⚡',
      target: 100,
      check: function (entries) {
        var totalHours = 0;
        (entries || []).forEach(function (e) {
          if (e.type === 'game') totalHours += (Number(e.playtime) || 0);
        });
        return { unlocked: totalHours >= 100, current: Math.min(Math.round(totalHours), 100), target: 100 };
      }
    },
    {
      id: 'game_veteran_250',
      category: 'game',
      name: '250-Hour Veteran',
      desc: 'Log 250+ total hours across all games in your log.',
      icon: '🗡️',
      target: 250,
      check: function (entries) {
        var totalHours = 0;
        (entries || []).forEach(function (e) {
          if (e.type === 'game') totalHours += (Number(e.playtime) || 0);
        });
        return { unlocked: totalHours >= 250, current: Math.min(Math.round(totalHours), 250), target: 250 };
      }
    },
    {
      id: 'game_acclaim',
      category: 'game',
      name: 'Critical Acclaim',
      desc: 'Rate 5 or more games 9/10 or 10/10.',
      icon: '💎',
      target: 5,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && (Number(e.gameRating) || 0) >= 9;
        }).length;
        return { unlocked: count >= 5, current: Math.min(count, 5), target: 5 };
      }
    },
    {
      id: 'game_pure_gold',
      category: 'game',
      name: 'Masterpiece Vault',
      desc: 'Award 10 or more games elite 9/10 or 10/10 scores.',
      icon: '🏅',
      target: 10,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && (Number(e.gameRating) || 0) >= 9;
        }).length;
        return { unlocked: count >= 10, current: Math.min(count, 10), target: 10 };
      }
    },
    {
      id: 'game_completionist',
      category: 'game',
      name: '100% Club',
      desc: 'Achieve 100% completion or record a second playthrough.',
      icon: '🎖️',
      target: 1,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          if (e.type !== 'game') return false;
          return e.is100Percent || (Array.isArray(e.rewatches) && e.rewatches.length > 0) || (e.rewatchCount && e.rewatchCount > 0);
        }).length;
        return { unlocked: count >= 1, current: Math.min(count, 1), target: 1 };
      }
    },
    {
      id: 'game_platinum_trio',
      category: 'game',
      name: 'Platinum Hunter',
      desc: 'Mark 3 or more games 100% completed.',
      icon: '💠',
      target: 3,
      check: function (entries) {
        var count = (entries || []).filter(function (e) {
          return e.type === 'game' && e.is100Percent;
        }).length;
        return { unlocked: count >= 3, current: Math.min(count, 3), target: 3 };
      }
    },
    {
      id: 'game_genre_hopper',
      category: 'game',
      name: 'Genre Chameleon',
      desc: 'Log completed games across 4 distinct genres.',
      icon: '🎲',
      target: 4,
      check: function (entries) {
        var genres = {};
        (entries || []).forEach(function (e) {
          if (e.type === 'game' && e.category) genres[e.category] = true;
        });
        var count = Object.keys(genres).length;
        return { unlocked: count >= 4, current: Math.min(count, 4), target: 4 };
      }
    },
    {
      id: 'game_replay_champ',
      category: 'game',
      name: 'New Game Plus',
      desc: 'Log 2 or more playthrough sessions in your diary.',
      icon: '🔄',
      target: 2,
      check: function (entries) {
        var total = 0;
        (entries || []).forEach(function (e) {
          if (e.type === 'game') {
            if (Array.isArray(e.rewatches)) total += e.rewatches.length;
            else if (e.rewatchCount) total += Number(e.rewatchCount) || 0;
          }
        });
        return { unlocked: total >= 2, current: Math.min(total, 2), target: 2 };
      }
    },

    // -------------------------------------------------------------
    // BOOKS MILESTONES (16 Milestones)
    // -------------------------------------------------------------
    {
      id: 'book_first',
      category: 'book',
      name: 'First Chapter',
      desc: 'Complete your first book in Playlog.',
      icon: '📖',
      target: 1,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) { return b.bookStatus === 'read'; }).length;
        return { unlocked: count >= 1, current: Math.min(count, 1), target: 1 };
      }
    },
    {
      id: 'book_5',
      category: 'book',
      name: 'Paperback Rider',
      desc: 'Finish reading 5 books.',
      icon: '📚',
      target: 5,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) { return b.bookStatus === 'read'; }).length;
        return { unlocked: count >= 5, current: Math.min(count, 5), target: 5 };
      }
    },
    {
      id: 'book_15',
      category: 'book',
      name: 'Bookworm',
      desc: 'Read 15 books across your shelves.',
      icon: '🐛',
      target: 15,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) { return b.bookStatus === 'read'; }).length;
        return { unlocked: count >= 15, current: Math.min(count, 15), target: 15 };
      }
    },
    {
      id: 'book_25',
      category: 'book',
      name: 'Grand Bibliophile',
      desc: 'Reach 25 books finished in your library.',
      icon: '📜',
      target: 25,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) { return b.bookStatus === 'read'; }).length;
        return { unlocked: count >= 25, current: Math.min(count, 25), target: 25 };
      }
    },
    {
      id: 'book_50',
      category: 'book',
      name: 'Library Guild',
      desc: 'Reach 50 books finished in your collection.',
      icon: '🏰',
      target: 50,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) { return b.bookStatus === 'read'; }).length;
        return { unlocked: count >= 50, current: Math.min(count, 50), target: 50 };
      }
    },
    {
      id: 'book_pages_1000',
      category: 'book',
      name: 'Page Turner',
      desc: 'Read over 1,000 total pages.',
      icon: '📑',
      target: 1000,
      check: function (entries, books) {
        var totalPages = 0;
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.pages) totalPages += Number(b.pages) || 0;
        });
        return { unlocked: totalPages >= 1000, current: Math.min(totalPages, 1000), target: 1000 };
      }
    },
    {
      id: 'book_pages_2000',
      category: 'book',
      name: 'Tome Master',
      desc: 'Read over 2,000 total pages across your completed books.',
      icon: '🕯️',
      target: 2000,
      check: function (entries, books) {
        var totalPages = 0;
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.pages) totalPages += Number(b.pages) || 0;
        });
        return { unlocked: totalPages >= 2000, current: Math.min(totalPages, 2000), target: 2000 };
      }
    },
    {
      id: 'book_pages_5000',
      category: 'book',
      name: 'Scholar of Alexandria',
      desc: 'Read over 5,000 total pages across your library.',
      icon: '🏺',
      target: 5000,
      check: function (entries, books) {
        var totalPages = 0;
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.pages) totalPages += Number(b.pages) || 0;
        });
        return { unlocked: totalPages >= 5000, current: Math.min(totalPages, 5000), target: 5000 };
      }
    },
    {
      id: 'book_gold',
      category: 'book',
      name: 'Literary Gold',
      desc: 'Rate 5 books 9/10 or higher.',
      icon: '🌟',
      target: 5,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) {
          return b.bookStatus === 'read' && (Number(b.bookRating) || 0) >= 9;
        }).length;
        return { unlocked: count >= 5, current: Math.min(count, 5), target: 5 };
      }
    },
    {
      id: 'book_author',
      category: 'book',
      name: 'Author Devotee',
      desc: 'Read 3 or more books by the same author.',
      icon: '✒️',
      target: 3,
      check: function (entries, books) {
        var authors = {};
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.author) {
            var a = b.author.trim();
            authors[a] = (authors[a] || 0) + 1;
          }
        });
        var max = 0;
        Object.keys(authors).forEach(function (a) { if (authors[a] > max) max = authors[a]; });
        return { unlocked: max >= 3, current: Math.min(max, 3), target: 3 };
      }
    },
    {
      id: 'book_author_canon',
      category: 'book',
      name: 'Canon Collector',
      desc: 'Read 5 or more books by a single beloved author.',
      icon: '🖋️',
      target: 5,
      check: function (entries, books) {
        var authors = {};
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.author) {
            var a = b.author.trim();
            authors[a] = (authors[a] || 0) + 1;
          }
        });
        var max = 0;
        Object.keys(authors).forEach(function (a) { if (authors[a] > max) max = authors[a]; });
        return { unlocked: max >= 5, current: Math.min(max, 5), target: 5 };
      }
    },
    {
      id: 'book_epic',
      category: 'book',
      name: 'Epic Volume',
      desc: 'Finish a book containing 400 or more pages.',
      icon: '📕',
      target: 400,
      check: function (entries, books) {
        var maxPages = 0;
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.pages) {
            var p = Number(b.pages) || 0;
            if (p > maxPages) maxPages = p;
          }
        });
        return { unlocked: maxPages >= 400, current: Math.min(maxPages, 400), target: 400 };
      }
    },
    {
      id: 'book_mammoth',
      category: 'book',
      name: 'Mammoth Read',
      desc: 'Finish a heavyweight tome containing 600 or more pages.',
      icon: '🦣',
      target: 600,
      check: function (entries, books) {
        var maxPages = 0;
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && b.pages) {
            var p = Number(b.pages) || 0;
            if (p > maxPages) maxPages = p;
          }
        });
        return { unlocked: maxPages >= 600, current: Math.min(maxPages, 600), target: 600 };
      }
    },
    {
      id: 'book_reread',
      category: 'book',
      name: 'Beloved Volume',
      desc: 'Record a re-read session for an old favorite book.',
      icon: '🔖',
      target: 1,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) {
          return b.bookStatus === 'read' && (b.reReadCount > 0 || (Array.isArray(b.reReadDates) && b.reReadDates.length > 0));
        }).length;
        return { unlocked: count >= 1, current: Math.min(count, 1), target: 1 };
      }
    },
    {
      id: 'book_series_scholar',
      category: 'book',
      name: 'Series Scholar',
      desc: 'Read 3 books belonging to a single book series.',
      icon: '📚',
      target: 3,
      check: function (entries, books) {
        var seriesMap = {};
        (books || []).forEach(function (b) {
          if (b.bookStatus === 'read' && (b.seriesName || b.seriesKey)) {
            var k = (b.seriesName || b.seriesKey).trim().toLowerCase();
            seriesMap[k] = (seriesMap[k] || 0) + 1;
          }
        });
        var max = 0;
        Object.keys(seriesMap).forEach(function (k) { if (seriesMap[k] > max) max = seriesMap[k]; });
        return { unlocked: max >= 3, current: Math.min(max, 3), target: 3 };
      }
    },
    {
      id: 'book_nonfiction',
      category: 'book',
      name: 'Curious Mind',
      desc: 'Finish 2 non-fiction books.',
      icon: '💡',
      target: 2,
      check: function (entries, books) {
        var count = (books || []).filter(function (b) {
          return b.bookStatus === 'read' && b.fiction === false;
        }).length;
        return { unlocked: count >= 2, current: Math.min(count, 2), target: 2 };
      }
    }
  ];

  var STORAGE_KEY = 'pl_acknowledged_trophies';

  function getAcknowledged() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setAcknowledged(ids) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {}
  }

  /**
   * Determine which media categories are active for this user.
   */
  function getActiveCategories(entries, books) {
    var movieCount = (entries || []).filter(function (e) { return e.type === 'movie' || e.type === 'series'; }).length;
    var gameCount = (entries || []).filter(function (e) { return e.type === 'game'; }).length;
    var booksEnabled = localStorage.getItem('pl-books') === '1' || localStorage.getItem('pl-books-enabled') === 'true';
    var bookCount = booksEnabled ? (books || []).length : 0;

    var cats = [];
    if (movieCount > 0) cats.push('movie');
    if (gameCount > 0) cats.push('game');
    if (booksEnabled && bookCount > 0) cats.push('book');

    if (cats.length === 0) {
      var defTab = localStorage.getItem('pl-pref-tab') || localStorage.getItem('pl-tab-pref') || 'media';
      cats.push(defTab === 'games' ? 'game' : 'movie');
      if (booksEnabled && bookCount > 0) cats.push('book');
    }
    return cats;
  }

  /**
   * Evaluates all badges and returns their status.
   */
  function evaluateBadges(entries, books) {
    var activeCats = getActiveCategories(entries, books);
    var visibleBadges = BADGES.filter(function (b) {
      return activeCats.indexOf(b.category) !== -1;
    });

    var evaluated = visibleBadges.map(function (b) {
      var res = b.check(entries, books);
      return {
        id: b.id,
        category: b.category,
        name: b.name,
        desc: b.desc,
        icon: b.icon,
        target: b.target,
        current: res.current,
        unlocked: res.unlocked,
        percent: Math.min(100, Math.round((res.current / b.target) * 100))
      };
    });

    return {
      activeCategories: activeCats,
      badges: evaluated,
      unlockedCount: evaluated.filter(function (b) { return b.unlocked; }).length,
      totalCount: evaluated.length
    };
  }

  /**
   * Checks for any newly unlocked badges that have not yet been celebrated on Home.
   */
  function checkNewAchievements(entries, books) {
    var data = evaluateBadges(entries, books);
    var acknowledged = getAcknowledged();
    var newlyUnlocked = data.badges.filter(function (b) {
      return b.unlocked && acknowledged.indexOf(b.id) === -1;
    });

    return {
      hasNew: newlyUnlocked.length > 0,
      newBadges: newlyUnlocked,
      acknowledgeAll: function () {
        var currentUnlockedIds = data.badges.filter(function (b) { return b.unlocked; }).map(function (b) { return b.id; });
        var union = acknowledged.slice();
        currentUnlockedIds.forEach(function (id) {
          if (union.indexOf(id) === -1) union.push(id);
        });
        setAcknowledged(union);
      }
    };
  }

  /**
   * Builds the Trophy Hall UI component for trophies.html.
   * Locked milestones show the TITLE ONLY; task/details are hidden until unlocked!
   */
  function renderTrophyHallHTML(entries, books, filterCategory) {
    var data = evaluateBadges(entries, books);
    var catLabels = {
      movie: { title: 'Cinema & TV', icon: '🎬' },
      game: { title: 'Games', icon: '🎮' },
      book: { title: 'Books', icon: '📖' }
    };

    var targetCategories = filterCategory && filterCategory !== 'all'
      ? [filterCategory]
      : data.activeCategories;

    var filteredBadges = data.badges.filter(function (b) {
      return targetCategories.indexOf(b.category) !== -1;
    });
    var unlockedInFilter = filteredBadges.filter(function (b) { return b.unlocked; }).length;
    var totalInFilter = filteredBadges.length;

    var html = '<div class="trophy-hall-shell">';
    html += '<div class="trophy-summary-bar">';
    html += '<div class="trophy-summary-text">';
    html += '<b>' + unlockedInFilter + ' of ' + totalInFilter + ' Milestones Unlocked</b>';
    html += '<span>Earned milestones reveal their secret requirements</span>';
    html += '</div>';
    html += '<div class="trophy-summary-prog"><div class="trophy-summary-fill" style="width:' + (totalInFilter ? Math.round(unlockedInFilter / totalInFilter * 100) : 0) + '%"></div></div>';
    html += '</div>';

    targetCategories.forEach(function (cat) {
      var catBadges = filteredBadges.filter(function (b) { return b.category === cat; });
      if (!catBadges.length) return;
      var catMeta = catLabels[cat] || { title: cat, icon: '🏆' };

      html += '<div class="trophy-section">';
      html += '<div class="trophy-section-title"><span>' + catMeta.icon + '</span> ' + catMeta.title + '</div>';
      html += '<div class="trophy-grid">';

      catBadges.forEach(function (b) {
        var isUnlocked = b.unlocked;
        html += '<div class="trophy-card ' + (isUnlocked ? 'is-unlocked' : 'is-locked') + '">';
        html += '<div class="trophy-icon-wrap">';
        html += '<div class="trophy-icon">' + (isUnlocked ? b.icon : '🔒') + '</div>';
        if (isUnlocked) {
          html += '<span class="trophy-check-tag">✓</span>';
        }
        html += '</div>';
        html += '<div class="trophy-info">';
        html += '<div class="trophy-name">' + b.name + '</div>';

        // USER REQUIREMENT: Unlocked shows details; Locked shows TITLE ONLY, task hidden!
        if (isUnlocked) {
          html += '<div class="trophy-desc">' + b.desc + '</div>';
          html += '<div class="trophy-unlocked-status">★ Milestone Unlocked</div>';
        } else {
          html += '<div class="trophy-desc trophy-hidden-task">🔒 Secret Milestone — Details revealed upon unlock</div>';
        }
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  /**
   * Compact preview for account.html settings page.
   */
  function renderTrophyPreviewHTML(entries, books) {
    var data = evaluateBadges(entries, books);
    return data.unlockedCount + ' of ' + data.totalCount + ' unlocked';
  }

  /**
   * Displays a compact notification on Home (undo-bar style like backup reminder)
   * when milestone achievements are unlocked. No intrusive modal or claim button.
   */
  function showHomeCelebrationModal(newBadges, onClaim) {
    if (!newBadges || !newBadges.length) return;

    var existing = document.querySelector('.trophy-undo-bar');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.className = 'undo-bar trophy-undo-bar';
    var text = newBadges.length === 1
      ? (newBadges[0].name + ' achievement unlocked!')
      : (newBadges.length + ' achievements unlocked!');

    bar.innerHTML = '<span>🏆 ' + AppUtils.esc(text) + '</span>' +
      '<button type="button" id="trophy-bar-view" style="cursor:pointer">View</button>' +
      '<button type="button" id="trophy-bar-close" aria-label="Dismiss" style="background:none;color:inherit;padding:7px 8px;cursor:pointer">✕</button>';

    document.body.appendChild(bar);

    if (typeof onClaim === 'function') {
      onClaim();
    }

    var viewBtn = bar.querySelector('#trophy-bar-view');
    if (viewBtn) {
      viewBtn.onclick = function () {
        bar.remove();
        window.location.href = '/trophies.html';
      };
    }

    var closeBtn = bar.querySelector('#trophy-bar-close');
    if (closeBtn) {
      closeBtn.onclick = function () {
        bar.remove();
      };
    }

    setTimeout(function () {
      if (bar.parentNode) bar.remove();
    }, 6000);
  }

  return {
    BADGES: BADGES,
    getActiveCategories: getActiveCategories,
    evaluateBadges: evaluateBadges,
    checkNewAchievements: checkNewAchievements,
    renderTrophyHallHTML: renderTrophyHallHTML,
    renderTrophyPreviewHTML: renderTrophyPreviewHTML,
    showHomeCelebrationModal: showHomeCelebrationModal,
    getAcknowledged: getAcknowledged,
    setAcknowledged: setAcknowledged
  };
});
