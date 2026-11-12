const contentList = document.querySelector('#content-list');

function renderSite(site) {
  document.title = site.title;
  document.querySelector('#brand-name').textContent = site.name;
  document.querySelector('#page-title').textContent = site.title;
  document.querySelector('#page-description').textContent = site.description;
  document.querySelector('#footer-name').textContent = site.name;
  document.querySelector('#footer-year').textContent = new Date().getFullYear();

  contentList.replaceChildren(...site.sections.map((section, index) => {
    const item = document.createElement('article');
    item.className = 'content-item';
    item.style.animationDelay = `${index * 80}ms`;

    const heading = document.createElement('h3');
    heading.textContent = section.title;

    const description = document.createElement('p');
    description.textContent = section.description;

    item.append(heading, description);
    return item;
  }));
}

async function loadSite() {
  try {
    const response = await fetch('/api/site');
    if (!response.ok) {
      throw new Error('Không thể tải dữ liệu website.');
    }

    renderSite(await response.json());
  } catch (error) {
    contentList.replaceChildren();
    const message = document.createElement('p');
    message.className = 'error-message';
    message.textContent = error.message;
    contentList.append(message);
  }
}

loadSite();