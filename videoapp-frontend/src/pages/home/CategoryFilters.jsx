
const categories = [
  "All",
  "Music",
  "Gaming",
  "Coding",
  "Education",
  "Comedy",
  "Podcasts",
];

function CategoryFilters({ selectedCategory = "All", onCategoryChange }) {
  return (
    <div
      className="
        flex w-full items-center gap-3
        overflow-x-auto whitespace-nowrap
        pb-1
        [-ms-overflow-style:none]
        [scrollbar-width:none]
        [&::-webkit-scrollbar]:hidden
      "
    >
      {categories.map((category) => {
        const isActive = selectedCategory === category;

        return (
          <button
            key={category}
            type="button"
            onClick={() => onCategoryChange?.(category)}
            className={`
              shrink-0 rounded-xl border px-5 py-2.5
              text-sm font-medium transition-colors duration-200
              ${
                isActive
                  ? "border-white bg-white text-black"
                  : "border-[#272a31] bg-[#13161d] text-gray-300 hover:bg-[#20232b] hover:text-white"
              }
            `}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}

export default CategoryFilters;
