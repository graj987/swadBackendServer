/**
 * Migration Guide: Convert Old HTML Blogs to New Block Format
 * 
 * This script helps migrate existing blogs from simple HTML content
 * to the new structured content blocks format.
 */

import Blog from "../models/blog.js";

/**
 * Convert HTML to Content Blocks
 * This is a basic converter - more complex HTML might need custom logic
 */
export const migrateHtmlToBlocks = async () => {
  try {
    console.log("🔄 Starting migration...");

    const blogs = await Blog.find({
      contentBlocks: { $exists: false },
    });

    console.log(`Found ${blogs.length} blogs to migrate`);

    let migrated = 0;
    let failed = 0;

    for (const blog of blogs) {
      try {
        const blocks = [];
        let blockId = 1;

        // If blog has old "content" field (HTML)
        if (blog.content && typeof blog.content === "string") {
          // Simple HTML to blocks conversion
          const htmlContent = blog.content;

          // Split by common HTML tags
          const sections = htmlContent.split(/<h2>|<h3>|<p>|<ul>|<li>/);

          sections.forEach((section) => {
            const cleanText = section
              .replace(/<[^>]*>/g, "") // Remove HTML tags
              .trim();

            if (!cleanText) return;

            // Try to detect block type
            if (section.includes("</h2>") || section.includes("</h3>")) {
              blocks.push({
                id: blockId++,
                type: "heading",
                content: cleanText,
                level: section.includes("</h2>") ? "h2" : "h3",
              });
            } else if (
              section.includes("</li>") ||
              section.includes("<li>")
            ) {
              // Convert list items
              const listItems = cleanText
                .split("\n")
                .filter((item) => item.trim());

              if (listItems.length > 0) {
                blocks.push({
                  id: blockId++,
                  type: "list",
                  items: listItems,
                });
              }
            } else if (cleanText.length > 20) {
              // Regular paragraph
              blocks.push({
                id: blockId++,
                type: "paragraph",
                content: cleanText,
              });
            }
          });
        }

        // If no blocks were created, create a single paragraph
        if (blocks.length === 0 && blog.content) {
          blocks.push({
            id: 1,
            type: "paragraph",
            content: blog.content
              .replace(/<[^>]*>/g, "")
              .substring(0, 1000),
          });
        }

        // Update blog with new structure
        blog.contentBlocks = blocks;

        // Also migrate old fields to new SEO fields if they don't exist
        if (!blog.metaTitle && blog.title) {
          blog.metaTitle = blog.title.substring(0, 60);
        }

        if (!blog.metaDescription && blog.excerpt) {
          blog.metaDescription = blog.excerpt.substring(0, 160);
        }

        if (!blog.focusKeyword && blog.title) {
          blog.focusKeyword = blog.title.split(" ").slice(0, 3).join(" ");
        }

        if (!blog.category) {
          blog.category = "other";
        }

        if (!blog.wordCount) {
          const text = blog.title + " " + blog.excerpt + " " + blog.content;
          blog.wordCount = text.split(/\s+/).length;
        }

        await blog.save();
        migrated++;
        console.log(`✅ Migrated: ${blog.title}`);
      } catch (error) {
        failed++;
        console.error(
          `❌ Failed to migrate ${blog.title}:`,
          error.message
        );
      }
    }

    console.log(`\n✨ Migration Complete!`);
    console.log(`✅ Migrated: ${migrated}`);
    console.log(`❌ Failed: ${failed}`);
  } catch (error) {
    console.error("Migration error:", error);
  }
};

/**
 * Manual Migration Script
 * Run this in your Node.js environment or create a CLI command
 * 
 * Usage:
 * node -e "import('./migrations.js').then(m => m.migrateHtmlToBlocks())"
 * 
 * Or add to your package.json:
 * "scripts": {
 *   "migrate:blogs": "node -e \"import('./migrations.js').then(m => m.migrateHtmlToBlocks())\""
 * }
 */

/**
 * BACKUP EXISTING BLOGS BEFORE MIGRATION
 */
export const backupBlogs = async () => {
  try {
    const blogs = await Blog.find();
    const backup = {
      timestamp: new Date().toISOString(),
      count: blogs.length,
      blogs: blogs,
    };

    const fs = await import("fs");
    fs.promises.writeFile(
      `./backups/blogs-backup-${Date.now()}.json`,
      JSON.stringify(backup, null, 2)
    );

    console.log("✅ Backup created successfully");
  } catch (error) {
    console.error("Backup error:", error);
  }
};

/**
 * Restore Blogs from Backup
 */
export const restoreBlogs = async (backupFile) => {
  try {
    const fs = await import("fs");
    const data = fs.readFileSync(backupFile, "utf-8");
    const backup = JSON.parse(data);

    console.log(`Restoring ${backup.count} blogs from ${backup.timestamp}`);

    for (const blogData of backup.blogs) {
      const { _id, __v, ...blogWithoutId } = blogData;

      if (_id) {
        await Blog.updateOne({ _id }, blogWithoutId);
      }
    }

    console.log("✅ Restore completed");
  } catch (error) {
    console.error("Restore error:", error);
  }
};

/**
 * Validate migrated blogs
 */
export const validateMigratedBlogs = async () => {
  try {
    const blogs = await Blog.find();
    const issues = [];

    blogs.forEach((blog) => {
      const validation = blog.validateForPublishing();

      if (!validation.isValid) {
        issues.push({
          blogId: blog._id,
          title: blog.title,
          errors: validation.errors,
        });
      }
    });

    if (issues.length === 0) {
      console.log("✅ All blogs are valid!");
    } else {
      console.log(`⚠️  Found ${issues.length} blogs with issues:`);
      console.table(issues);
    }

    return issues;
  } catch (error) {
    console.error("Validation error:", error);
  }
};

/**
 * Fix missing SEO fields
 */
export const fixMissingSeoFields = async () => {
  try {
    console.log("🔧 Fixing missing SEO fields...");

    const blogs = await Blog.find({
      $or: [
        { metaTitle: { $exists: false } },
        { metaDescription: { $exists: false } },
        { focusKeyword: { $exists: false } },
      ],
    });

    let fixed = 0;

    for (const blog of blogs) {
      if (!blog.metaTitle && blog.title) {
        blog.metaTitle = blog.title.substring(0, 60);
      }

      if (!blog.metaDescription && blog.excerpt) {
        blog.metaDescription = blog.excerpt.substring(0, 160);
      }

      if (!blog.focusKeyword && blog.title) {
        blog.focusKeyword = blog.title.split(" ").slice(0, 3).join(" ");
      }

      await blog.save();
      fixed++;
    }

    console.log(`✅ Fixed ${fixed} blogs`);
  } catch (error) {
    console.error("Fix error:", error);
  }
};

/**
 * Generate missing featured images
 * (Requires manual intervention in most cases)
 */
export const checkMissingImages = async () => {
  try {
    const blogsWithoutImages = await Blog.find({ image: { $exists: false } });

    if (blogsWithoutImages.length === 0) {
      console.log("✅ All blogs have featured images");
      return;
    }

    console.log(`⚠️  Found ${blogsWithoutImages.length} blogs without images:`);
    blogsWithoutImages.forEach((blog) => {
      console.log(`  - ${blog.title} (ID: ${blog._id})`);
    });

    console.log(
      "\nManual action required: Add featured images to these blogs"
    );
  } catch (error) {
    console.error("Check error:", error);
  }
};

/**
 * Complete migration workflow
 */
export const runCompleteMigration = async () => {
  try {
    console.log("🚀 Starting Complete Migration Workflow\n");

    // Step 1: Backup
    console.log("Step 1: Backing up existing blogs...");
    await backupBlogs();

    // Step 2: Migrate
    console.log("\nStep 2: Migrating blogs to new format...");
    await migrateHtmlToBlocks();

    // Step 3: Fix missing fields
    console.log("\nStep 3: Fixing missing SEO fields...");
    await fixMissingSeoFields();

    // Step 4: Check images
    console.log("\nStep 4: Checking for missing images...");
    await checkMissingImages();

    // Step 5: Validate
    console.log("\nStep 5: Validating migrated blogs...");
    await validateMigratedBlogs();

    console.log("\n✨ Migration workflow complete!");
  } catch (error) {
    console.error("Workflow error:", error);
  }
};

/**
 * IMPORTANT: Before running migration
 * 
 * 1. Create a backup of your database
 * 2. Test migration on a development copy first
 * 3. Review the migration script
 * 4. Run the complete migration workflow
 * 5. Validate all blogs are correct
 * 6. Test on staging before production
 * 
 * In case of issues, restore from backup.
 */

export default {
  migrateHtmlToBlocks,
  backupBlogs,
  restoreBlogs,
  validateMigratedBlogs,
  fixMissingSeoFields,
  checkMissingImages,
  runCompleteMigration,
};